import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { join } from "node:path";

/**
 * The runner against a real, migrated SQLite database. Only the two things
 * that leave the process — the optimizer's market data and the email — are
 * stubbed, so claiming, charging, refunds and pausing all run for real.
 */

const { dir, runOptimization, sendEmail } = vi.hoisted(() => {
  // Hoisted above the imports, so the db module connects to a scratch file.
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const dir = fs.mkdtempSync(`${os.tmpdir()}/runner-test-`);
  process.env.DATABASE_URL = `file:${dir}/test.db`;
  process.env.FRONTEND_URL = "https://app.example";
  return { dir, runOptimization: vi.fn(), sendEmail: vi.fn() };
});

vi.mock("../optimization/service.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../optimization/service.js")>()),
  runOptimization,
}));
vi.mock("../../lib/email/send.js", () => ({ sendEmail }));

const { migrate } = await import("drizzle-orm/libsql/migrator");
const { eq } = await import("drizzle-orm");
const { db } = await import("../../db/index.js");
const schema = await import("../../db/schema.js");
const { grantCredits } = await import("../../lib/billing/spend.js");
const { runDueSchedules, PAUSE_AFTER_FAILURES } = await import("./runner.js");

const USER_ID = "user-1";

const WEB_PARAMS = {
  tickers: ["SPY", "TLT"],
  assets: [
    { ticker: "SPY", allocation: null },
    { ticker: "TLT", allocation: null },
  ],
  dateRange: { startMonth: 1, startYear: 2020, endMonth: 1, endYear: 2025 },
  strategy: "max-sharpe",
  riskFreeRate: 0.03,
  enforceFullInvestment: true,
  allowShortSelling: false,
  useLeverage: false,
  maxLeverage: 1,
  assetConstraints: false,
  wMax: 1,
  showFrontier: true,
};

const MOBILE_PARAMS = {
  tickers: ["SPY", "TLT"],
  strategy: "max-sharpe",
  start_date: "2020-01-01",
  end_date: "2025-01-31",
};

function result(spyWeight: number, expectedReturn = 0.08) {
  return {
    weights: [
      { fund_id: 0, fund_name: "SPY", weight: spyWeight, exp_ret: 0.1, volatility: 0.18 },
      { fund_id: 1, fund_name: "TLT", weight: 1 - spyWeight, exp_ret: 0.03, volatility: 0.12 },
    ],
    expected_return: expectedReturn,
    volatility: 0.11,
    sharpe_ratio: 0.45,
    strategy: "max-sharpe",
    covariance_matrix: [],
    stats: {
      ci_95_low: 0,
      ci_95_high: 0,
      prob_neg_1m: 0,
      prob_neg_3m: 0,
      prob_neg_1y: 0,
      prob_neg_2y: 0,
    },
  };
}

const DAY = 86_400_000;
const MONDAY_MORNING = new Date("2026-09-14T06:30:00Z");

async function balance(): Promise<number> {
  const wallet = await db.query.walletBalance.findFirst({
    where: eq(schema.walletBalance.userId, USER_ID),
  });
  return wallet?.credits ?? 0;
}

async function schedule(id: string) {
  return (await db.query.simulationSchedules.findFirst({
    where: eq(schema.simulationSchedules.id, id),
  }))!;
}

async function createSimulation(id: string, params: object) {
  await db.insert(schema.simulations).values({
    id,
    userId: USER_ID,
    name: `Sim ${id}`,
    params: JSON.stringify(params),
    result: JSON.stringify(result(0.5)),
  });
}

async function createSchedule(
  id: string,
  simulationIds: string[],
  overrides: Partial<typeof schema.simulationSchedules.$inferInsert> = {}
) {
  await db.insert(schema.simulationSchedules).values({
    id,
    userId: USER_ID,
    name: "Weekly",
    cadence: "weekly",
    dayOfWeek: 1,
    timezone: "UTC",
    locale: "en",
    nextRunAt: new Date(MONDAY_MORNING.getTime() - 6 * 3_600_000),
    ...overrides,
  });
  await db
    .insert(schema.scheduleSimulations)
    .values(simulationIds.map((simulationId) => ({ scheduleId: id, simulationId })));
}

/** Make a schedule due again at `now`, as if its next slot had arrived. */
async function makeDue(id: string, now: Date) {
  await db
    .update(schema.simulationSchedules)
    .set({ nextRunAt: new Date(now.getTime() - 1000) })
    .where(eq(schema.simulationSchedules.id, id));
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: join(import.meta.dirname, "../../../drizzle") });
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  for (const table of [
    schema.simulationRuns,
    schema.scheduleSimulations,
    schema.simulationSchedules,
    schema.creditLedger,
    schema.walletBalance,
    schema.simulations,
    schema.user,
  ]) {
    await db.delete(table);
  }
  await db.insert(schema.user).values({
    id: USER_ID,
    name: "Ada",
    email: "ada@example.com",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  runOptimization.mockReset().mockResolvedValue(result(0.6));
  sendEmail.mockReset().mockResolvedValue(undefined);
});

describe("runDueSchedules", () => {
  it("runs a due schedule: one credit, one run row, updated simulation, one email", async () => {
    await grantCredits({ userId: USER_ID, credits: 5, reason: "grant", idempotencyKey: "seed" });
    await createSimulation("sim-1", WEB_PARAMS);
    await createSchedule("sch-1", ["sim-1"]);

    const summary = await runDueSchedules(MONDAY_MORNING);

    expect(summary).toMatchObject({ claimed: 1, simulationsRun: 1, emailsSent: 1 });
    expect(await balance()).toBe(4);

    // The replayed request moved the end date to the current month.
    expect(runOptimization).toHaveBeenCalledWith(
      expect.objectContaining({ start_date: "2020-01-01", end_date: "2026-09-30" })
    );

    const runs = await db.select().from(schema.simulationRuns);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ simulationId: "sim-1", scheduleId: "sch-1", status: "success" });

    const sim = await db.query.simulations.findFirst({ where: eq(schema.simulations.id, "sim-1") });
    expect(JSON.parse(sim!.params).dateRange).toEqual({
      startMonth: 1,
      startYear: 2020,
      endMonth: 9,
      endYear: 2026,
    });
    expect(JSON.parse(sim!.result).weights[0].weight).toBe(0.6);

    // In the language captured on the schedule, not the Spanish default.
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0]).toMatchObject({
      to: "ada@example.com",
      subject: "Your scheduled report: Weekly",
    });
    expect(sendEmail.mock.calls[0][0].react.props.entries[0].previous).toBeNull();

    // Claimed for the following Monday.
    const after = await schedule("sch-1");
    expect(after.nextRunAt.toISOString()).toBe("2026-09-21T00:00:00.000Z");
    expect(after.lastRunAt!.getTime()).toBe(MONDAY_MORNING.getTime());
  });

  it("charges exactly one credit when fired twice on the same day", async () => {
    await grantCredits({ userId: USER_ID, credits: 5, reason: "grant", idempotencyKey: "seed" });
    await createSimulation("sim-1", WEB_PARAMS);
    await createSchedule("sch-1", ["sim-1"]);

    await runDueSchedules(MONDAY_MORNING);
    // Second tick: the claim already moved next_run_at, so nothing is due.
    const second = await runDueSchedules(new Date(MONDAY_MORNING.getTime() + 30 * 60_000));
    expect(second.claimed).toBe(0);

    // Even if it were due again the same day, the idempotency key replays the charge.
    await makeDue("sch-1", MONDAY_MORNING);
    await runDueSchedules(new Date(MONDAY_MORNING.getTime() + 60 * 60_000));

    expect(await balance()).toBe(4);
    const spends = await db
      .select()
      .from(schema.creditLedger)
      .where(eq(schema.creditLedger.reason, "spend"));
    expect(spends).toHaveLength(1);
  });

  it("diffs a later run against the previous one", async () => {
    await grantCredits({ userId: USER_ID, credits: 5, reason: "grant", idempotencyKey: "seed" });
    await createSimulation("sim-1", WEB_PARAMS);
    await createSchedule("sch-1", ["sim-1"]);

    await runDueSchedules(MONDAY_MORNING);
    runOptimization.mockResolvedValue(result(0.7, 0.09));
    const nextMonday = new Date(MONDAY_MORNING.getTime() + 7 * DAY);
    await runDueSchedules(nextMonday);

    const entry = sendEmail.mock.calls[1][0].react.props.entries[0];
    expect(entry.previous).toMatchObject({ expectedReturn: 0.08 });
    expect(entry.current).toMatchObject({ expectedReturn: 0.09 });
    expect(entry.weights[0]).toMatchObject({ ticker: "SPY", previousWeight: 0.6, weight: 0.7 });
    expect(await balance()).toBe(3);
  });

  it(`pauses after ${PAUSE_AFTER_FAILURES} runs without credits and emails exactly once`, async () => {
    await createSimulation("sim-1", WEB_PARAMS);
    await createSchedule("sch-1", ["sim-1"], { cadence: "daily", dayOfWeek: null });

    for (let day = 0; day < PAUSE_AFTER_FAILURES; day++) {
      const now = new Date(MONDAY_MORNING.getTime() + day * DAY);
      await makeDue("sch-1", now);
      await runDueSchedules(now);
      const current = await schedule("sch-1");
      expect(current.consecutiveFailures).toBe(day + 1);
      expect(current.active).toBe(day + 1 < PAUSE_AFTER_FAILURES);
    }

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].subject).toBe("We couldn't run your scheduled report");
    expect(runOptimization).not.toHaveBeenCalled();
    expect(await db.select().from(schema.creditLedger)).toHaveLength(0);

    // Paused: no longer picked up even when its slot passes.
    await makeDue("sch-1", new Date(MONDAY_MORNING.getTime() + 5 * DAY));
    const later = await runDueSchedules(new Date(MONDAY_MORNING.getTime() + 5 * DAY));
    expect(later.due).toBe(0);
  });

  it("resets the failure streak once a run is paid for again", async () => {
    await createSimulation("sim-1", WEB_PARAMS);
    await createSchedule("sch-1", ["sim-1"], { consecutiveFailures: 2 });
    await grantCredits({ userId: USER_ID, credits: 1, reason: "grant", idempotencyKey: "seed" });

    await runDueSchedules(MONDAY_MORNING);

    expect((await schedule("sch-1")).consecutiveFailures).toBe(0);
  });

  it("skips mobile-shaped params without charging or throwing, and runs the rest", async () => {
    await grantCredits({ userId: USER_ID, credits: 5, reason: "grant", idempotencyKey: "seed" });
    await createSimulation("sim-mobile", MOBILE_PARAMS);
    await createSimulation("sim-web", WEB_PARAMS);
    await createSchedule("sch-1", ["sim-mobile", "sim-web"]);

    const summary = await runDueSchedules(MONDAY_MORNING);

    expect(summary).toMatchObject({ simulationsRun: 1, simulationsFailed: 1 });
    expect(await balance()).toBe(4);
    const failed = await db
      .select()
      .from(schema.simulationRuns)
      .where(eq(schema.simulationRuns.simulationId, "sim-mobile"));
    expect(failed).toMatchObject([{ status: "failed", errorMessage: "unreplayable_params" }]);
    expect(sendEmail.mock.calls[0][0].react.props.failedCount).toBe(1);
  });

  it("refunds the credit when the optimization throws", async () => {
    await grantCredits({ userId: USER_ID, credits: 5, reason: "grant", idempotencyKey: "seed" });
    await createSimulation("sim-1", WEB_PARAMS);
    await createSchedule("sch-1", ["sim-1"]);
    runOptimization.mockRejectedValueOnce(new Error("yahoo down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await runDueSchedules(MONDAY_MORNING);

    expect(await balance()).toBe(5);
    const [run] = await db.select().from(schema.simulationRuns);
    expect(run).toMatchObject({ status: "failed", errorMessage: "optimize_failed" });
    // Nothing succeeded, so there is nothing to report.
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("leaves schedules that are not due or are paused alone", async () => {
    await grantCredits({ userId: USER_ID, credits: 5, reason: "grant", idempotencyKey: "seed" });
    await createSimulation("sim-1", WEB_PARAMS);
    await createSchedule("sch-future", ["sim-1"], {
      nextRunAt: new Date(MONDAY_MORNING.getTime() + DAY),
    });
    await createSchedule("sch-paused", ["sim-1"], { active: false });

    const summary = await runDueSchedules(MONDAY_MORNING);

    expect(summary.due).toBe(0);
    expect(runOptimization).not.toHaveBeenCalled();
  });
});
