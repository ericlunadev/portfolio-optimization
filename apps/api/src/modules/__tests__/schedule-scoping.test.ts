// Schedules predate tenancy (#44 on top of #31) and were scoped by user alone
// (#46). Every user has one membership, so a user-only predicate looks correct
// until someone moves organization: then the schedule they left behind is still
// theirs by `user_id`, and only the org predicate keeps it out of reach. The
// moved-analyst fixture is what makes that predicate observable.

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "../../db/index.js";
import { scheduleSimulations, simulationSchedules } from "../../db/schema.js";
import {
  asUser,
  seedMovedAnalyst,
  seedOrg,
  seedSimulation,
  seedUser,
} from "../../test/factories.js";

// Web-shaped params the runner can replay, so a POST gets past `planReplay`.
const REPLAYABLE = {
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

const WEEKLY = { cadence: "weekly", dayOfWeek: 1, timezone: "UTC", locale: "en" };

async function seedSchedule(options: { organizationId: string; userId: string; simulationId: string }) {
  const id = crypto.randomUUID();
  await db.insert(simulationSchedules).values({
    id,
    userId: options.userId,
    organizationId: options.organizationId,
    cadence: "weekly",
    dayOfWeek: 1,
    nextRunAt: new Date("2030-01-07T00:00:00Z"),
  });
  await db.insert(scheduleSimulations).values({ scheduleId: id, simulationId: options.simulationId });
  return id;
}

describe("POST /api/schedules", () => {
  it("stamps the caller's organization", async () => {
    await seedOrg({ id: "org-aaa-schedule-decoy" });
    const org = await seedOrg({ id: "org-bbb-schedule-caller" });
    const analyst = await seedUser({ organizationId: org.id });
    const sim = await seedSimulation({ organizationId: org.id, userId: analyst.id, params: REPLAYABLE });

    const res = await asUser(analyst)("/api/schedules", {
      method: "POST",
      json: { ...WEEKLY, simulationIds: [sim.id] },
    });

    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    const row = await db.query.simulationSchedules.findFirst({ where: eq(simulationSchedules.id, id) });
    expect(row?.organizationId).toBe(org.id);
    expect(row?.userId).toBe(analyst.id);
  });

  it("refuses the caller's own simulation left behind in another organization", async () => {
    const moved = await seedMovedAnalyst();
    const leftBehind = await seedSimulation({
      organizationId: moved.previousOrganizationId,
      userId: moved.user.id,
      params: REPLAYABLE,
    });

    const res = await asUser(moved.user)("/api/schedules", {
      method: "POST",
      json: { ...WEEKLY, simulationIds: [leftBehind.id] },
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "simulation_not_found" });
  });

  it("refuses a colleague's simulation even when it is shared with the organization", async () => {
    // Shared grants read, never write, and every scheduled run overwrites it.
    const org = await seedOrg();
    const owner = await seedUser({ organizationId: org.id });
    const colleague = await seedUser({ organizationId: org.id });
    const shared = await seedSimulation({
      organizationId: org.id,
      userId: owner.id,
      params: REPLAYABLE,
      sharedWithOrg: true,
    });

    const res = await asUser(colleague)("/api/schedules", {
      method: "POST",
      json: { ...WEEKLY, simulationIds: [shared.id] },
    });

    expect(res.status).toBe(404);
  });
});

describe("a schedule left behind in another organization", () => {
  async function seedLeftBehind() {
    const moved = await seedMovedAnalyst();
    const scheduleId = await seedSchedule({
      organizationId: moved.previousOrganizationId,
      userId: moved.user.id,
      simulationId: moved.simulation.id,
    });
    return { moved, scheduleId };
  }

  it("is not listed", async () => {
    const { moved } = await seedLeftBehind();

    const res = await asUser(moved.user)("/api/schedules");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("cannot be edited", async () => {
    const { moved, scheduleId } = await seedLeftBehind();

    const res = await asUser(moved.user)(`/api/schedules/${scheduleId}`, {
      method: "PATCH",
      json: { active: false },
    });

    expect(res.status).toBe(404);
    const row = await db.query.simulationSchedules.findFirst({
      where: eq(simulationSchedules.id, scheduleId),
    });
    expect(row?.active).toBe(true);
  });

  it("cannot be deleted", async () => {
    const { moved, scheduleId } = await seedLeftBehind();

    const res = await asUser(moved.user)(`/api/schedules/${scheduleId}`, { method: "DELETE" });

    expect(res.status).toBe(404);
    const row = await db.query.simulationSchedules.findFirst({
      where: eq(simulationSchedules.id, scheduleId),
    });
    expect(row).toBeDefined();
  });
});
