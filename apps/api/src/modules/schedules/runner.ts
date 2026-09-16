import { and, asc, desc, eq, lte, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { randomUUID } from "node:crypto";
import { createElement } from "react";
import { db } from "../../db/index.js";
import {
  scheduleSimulations,
  simulationRuns,
  simulationSchedules,
  simulations,
  user,
  type SimulationSchedule,
} from "../../db/schema.js";
import { env } from "../../config/env.js";
import { reverseSpend, spendCredit } from "../../lib/billing/spend.js";
import { sendEmail } from "../../lib/email/send.js";
import { emailMessages } from "../../lib/email/i18n.js";
import type { EmailLocale } from "../../lib/email/locale.js";
import {
  ScheduledNoCredits,
  ScheduledReport,
  type ReportEntry,
  type ReportMetrics,
} from "../../lib/email/templates/ScheduledReport.js";
import { runOptimization, type OptimizeResponse } from "../optimization/service.js";
import { computeNextRunAt, formatLocalDate, localDateOf, type ScheduleTiming } from "./next-run.js";
import { planReplay, type ReplayableParams } from "./replay.js";

/**
 * Executes every schedule that is due. Called in the background by
 * `POST /api/internal/run-schedules`, once a day.
 *
 * Order matters. A schedule is **claimed** first — its `next_run_at` advances
 * before any work — so a batch that crashes or a trigger that fires twice never
 * re-runs it; it waits for its next natural slot. Each simulation is then
 * charged under a date-scoped idempotency key, so even a replay on the same day
 * cannot charge twice.
 */

/** Consecutive out-of-credit runs after which a schedule pauses itself. */
export const PAUSE_AFTER_FAILURES = 3;

/** How many weight rows the email shows per simulation. */
const WEIGHT_ROWS = 3;

export interface RunSummary {
  due: number;
  claimed: number;
  simulationsRun: number;
  simulationsFailed: number;
  emailsSent: number;
  outOfCredits: number;
  paused: number;
}

export async function runDueSchedules(now: Date = new Date()): Promise<RunSummary> {
  const summary: RunSummary = {
    due: 0,
    claimed: 0,
    simulationsRun: 0,
    simulationsFailed: 0,
    emailsSent: 0,
    outOfCredits: 0,
    paused: 0,
  };

  const due = await db
    .select()
    .from(simulationSchedules)
    .where(and(eq(simulationSchedules.active, true), lte(simulationSchedules.nextRunAt, now)))
    .orderBy(asc(simulationSchedules.nextRunAt));
  summary.due = due.length;

  for (const schedule of due) {
    try {
      if (!(await claim(schedule, now))) continue;
      summary.claimed += 1;
      await runSchedule(schedule, now, summary);
    } catch (err) {
      // One broken schedule must not stop the rest of the batch.
      console.error(`[schedules] schedule ${schedule.id} failed`, err);
    }
  }

  console.log("[schedules] run complete", summary);
  return summary;
}

/** Advance `next_run_at` atomically; false when another worker got there first. */
async function claim(schedule: SimulationSchedule, now: Date): Promise<boolean> {
  const nextRunAt = computeNextRunAt(schedule as ScheduleTiming, now);
  const claimed = await db
    .update(simulationSchedules)
    .set({ nextRunAt, lastRunAt: now, updatedAt: now })
    .where(
      and(
        eq(simulationSchedules.id, schedule.id),
        eq(simulationSchedules.active, true),
        lte(simulationSchedules.nextRunAt, now)
      )
    )
    .returning({ id: simulationSchedules.id });
  return claimed.length > 0;
}

type SimulationOutcome =
  | { kind: "success"; entry: ReportEntry }
  | { kind: "failed" }
  | { kind: "no-credits" };

async function runSchedule(schedule: SimulationSchedule, now: Date, summary: RunSummary) {
  const owner = await db.query.user.findFirst({ where: eq(user.id, schedule.userId) });
  if (!owner) return;

  const sims = await db
    .select({
      id: simulations.id,
      name: simulations.name,
      params: simulations.params,
    })
    .from(scheduleSimulations)
    .innerJoin(simulations, eq(scheduleSimulations.simulationId, simulations.id))
    // A simulation can outlive its owner's claim on it (user_id set null).
    .where(and(eq(scheduleSimulations.scheduleId, schedule.id), eq(simulations.userId, owner.id)))
    .orderBy(asc(simulations.createdAt));

  const entries: ReportEntry[] = [];
  let failedCount = 0;
  let outOfCredits = false;

  for (const sim of sims) {
    const outcome = await runSimulation(schedule, sim, now);
    if (outcome.kind === "no-credits") {
      // Nothing after this can be paid for either.
      outOfCredits = true;
      break;
    }
    if (outcome.kind === "success") {
      entries.push(outcome.entry);
      summary.simulationsRun += 1;
    } else {
      failedCount += 1;
      summary.simulationsFailed += 1;
    }
  }

  const locale = schedule.locale as EmailLocale;

  // Whatever was paid for is delivered, even if credits ran out part-way.
  if (entries.length > 0) {
    const sent = await trySend(() =>
      sendEmail({
        to: owner.email,
        subject: emailMessages[locale].scheduledSubject(schedule.name),
        react: createElement(ScheduledReport, {
          locale,
          userName: owner.name,
          scheduleName: schedule.name,
          entries,
          failedCount,
          manageUrl: `${env.FRONTEND_URL}/schedules`,
        }),
      })
    );
    if (sent) summary.emailsSent += 1;
  }

  if (!outOfCredits) {
    if (schedule.consecutiveFailures !== 0) {
      await db
        .update(simulationSchedules)
        .set({ consecutiveFailures: 0 })
        .where(eq(simulationSchedules.id, schedule.id));
    }
    return;
  }

  summary.outOfCredits += 1;
  const failures = schedule.consecutiveFailures + 1;
  const pause = failures >= PAUSE_AFTER_FAILURES;
  await db
    .update(simulationSchedules)
    .set({
      consecutiveFailures: failures,
      ...(pause ? { active: false } : {}),
      updatedAt: now,
    })
    .where(eq(simulationSchedules.id, schedule.id));
  if (pause) summary.paused += 1;

  // Once per streak: the first email already warns about the pause, so a
  // user who ignores it is not emailed again every run.
  if (failures === 1) {
    const sent = await trySend(() =>
      sendEmail({
        to: owner.email,
        subject: emailMessages[locale].scheduledNoCreditsSubject,
        react: createElement(ScheduledNoCredits, {
          locale,
          userName: owner.name,
          pauseAfterAttempts: PAUSE_AFTER_FAILURES,
          billingUrl: `${env.FRONTEND_URL}/billing`,
          manageUrl: `${env.FRONTEND_URL}/schedules`,
        }),
      })
    );
    if (sent) summary.emailsSent += 1;
  }
}

async function runSimulation(
  schedule: SimulationSchedule,
  sim: { id: string; name: string | null; params: string },
  now: Date
): Promise<SimulationOutcome> {
  const plan = planReplay(sim.params, now, schedule.timezone);
  if (!plan.ok) {
    // Checked at creation, but the simulation may have changed since.
    await recordFailure(schedule, sim, sim.params, plan.reason, now);
    return { kind: "failed" };
  }

  const runDate = formatLocalDate(localDateOf(now, schedule.timezone));
  let spend;
  try {
    spend = await spendCredit({
      userId: schedule.userId,
      idempotencyKey: `schedule:${schedule.id}:${sim.id}:${runDate}`,
      cost: 1,
      simulationId: sim.id,
    });
  } catch (err) {
    if (err instanceof HTTPException && err.status === 402) return { kind: "no-credits" };
    throw err;
  }

  let result: OptimizeResponse;
  try {
    result = await runOptimization(plan.optimizeParams);
  } catch (err) {
    console.error(`[schedules] optimization failed for simulation ${sim.id}`, err);
    await reverseSpend(spend.ledgerId, "scheduled_optimize_failed");
    await recordFailure(schedule, sim, JSON.stringify(plan.params), "optimize_failed", now);
    return { kind: "failed" };
  }

  const previous = await previousSuccessfulRun(sim.id);

  const paramsJson = JSON.stringify(plan.params);
  const resultJson = JSON.stringify(result);
  await db.batch([
    db.insert(simulationRuns).values({
      id: randomUUID(),
      simulationId: sim.id,
      scheduleId: schedule.id,
      params: paramsJson,
      result: resultJson,
      status: "success",
      createdAt: now,
    }),
    // Latest wins, exactly as a manual re-run leaves the simulation.
    db
      .update(simulations)
      .set({ params: paramsJson, result: resultJson })
      .where(eq(simulations.id, sim.id)),
  ]);

  return { kind: "success", entry: buildEntry(sim, plan.params, result, previous) };
}

async function recordFailure(
  schedule: SimulationSchedule,
  sim: { id: string },
  params: string,
  reason: string,
  now: Date
) {
  await db.insert(simulationRuns).values({
    id: randomUUID(),
    simulationId: sim.id,
    scheduleId: schedule.id,
    params,
    result: null,
    status: "failed",
    errorMessage: reason,
    createdAt: now,
  });
}

async function previousSuccessfulRun(simulationId: string): Promise<OptimizeResponse | null> {
  const row = await db
    .select({ result: simulationRuns.result })
    .from(simulationRuns)
    .where(and(eq(simulationRuns.simulationId, simulationId), eq(simulationRuns.status, "success")))
    .orderBy(desc(simulationRuns.createdAt), desc(sql`rowid`))
    .limit(1);
  return row[0]?.result ? (JSON.parse(row[0].result) as OptimizeResponse) : null;
}

function metrics(result: OptimizeResponse): ReportMetrics {
  return {
    expectedReturn: result.expected_return,
    volatility: result.volatility,
    sharpeRatio: result.sharpe_ratio,
  };
}

/** DD/MM/YYYY, per the project's date format. */
function ddmmyyyy(year: number, month: number, day: number): string {
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

export function buildEntry(
  sim: { id: string; name: string | null },
  params: ReplayableParams,
  result: OptimizeResponse,
  previous: OptimizeResponse | null
): ReportEntry {
  const { dateRange } = params;
  const lastDay = new Date(Date.UTC(dateRange.endYear, dateRange.endMonth, 0)).getUTCDate();
  const previousWeights = new Map(previous?.weights.map((w) => [w.fund_name, w.weight]) ?? []);

  const weights = result.weights
    .map((w) => ({
      ticker: w.fund_name,
      weight: w.weight,
      previousWeight: previous ? (previousWeights.get(w.fund_name) ?? 0) : null,
    }))
    .sort((a, b) =>
      previous
        ? Math.abs(b.weight - (b.previousWeight ?? 0)) - Math.abs(a.weight - (a.previousWeight ?? 0))
        : b.weight - a.weight
    )
    .slice(0, WEIGHT_ROWS);

  return {
    simulationId: sim.id,
    name: sim.name ?? params.tickers.join(", "),
    periodStart: ddmmyyyy(dateRange.startYear, dateRange.startMonth, 1),
    periodEnd: ddmmyyyy(dateRange.endYear, dateRange.endMonth, lastDay),
    current: metrics(result),
    previous: previous ? metrics(previous) : null,
    weights,
    url: `${env.FRONTEND_URL}/efficient-frontier/${sim.id}`,
  };
}

async function trySend(send: () => Promise<void>): Promise<boolean> {
  try {
    await send();
    return true;
  } catch (err) {
    // The run is already recorded and paid for; a failed email is logged,
    // not retried, so the batch keeps moving.
    console.error("[schedules] email failed", err);
    return false;
  }
}
