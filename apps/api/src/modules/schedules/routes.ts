import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  scheduleSimulations,
  simulationSchedules,
  simulations,
  type SimulationSchedule,
} from "../../db/schema.js";
import { authMiddleware } from "../../middleware/auth.js";
import { getLocaleFromRequest } from "../../lib/email/locale.js";
import { toISOStringOrNow } from "../../lib/dates.js";
import {
  CADENCES,
  MAX_DAY_OF_MONTH,
  computeNextRunAt,
  isValidTimezone,
  type ScheduleTiming,
} from "./next-run.js";
import { planReplay } from "./replay.js";

const app = new Hono();

// All schedule routes require authentication and are scoped per user
app.use("*", authMiddleware);

const timingFields = {
  cadence: z.enum(CADENCES),
  dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  dayOfMonth: z.number().int().min(1).max(MAX_DAY_OF_MONTH).nullable().optional(),
  timezone: z.string().refine(isValidTimezone, "invalid timezone"),
};

/** Keep only the day field the cadence reads, and require it. */
function normalizeTiming(input: {
  cadence: ScheduleTiming["cadence"];
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  timezone: string;
}): ScheduleTiming | { error: string } {
  const { cadence, timezone } = input;
  if (cadence === "weekly") {
    if (input.dayOfWeek == null) return { error: "day_of_week_required" };
    return { cadence, dayOfWeek: input.dayOfWeek, dayOfMonth: null, timezone };
  }
  if (cadence === "monthly") {
    if (input.dayOfMonth == null) return { error: "day_of_month_required" };
    return { cadence, dayOfWeek: null, dayOfMonth: input.dayOfMonth, timezone };
  }
  return { cadence, dayOfWeek: null, dayOfMonth: null, timezone };
}

async function serializeSchedules(rows: SimulationSchedule[]) {
  if (rows.length === 0) return [];

  const links = await db
    .select({
      scheduleId: scheduleSimulations.scheduleId,
      id: simulations.id,
      name: simulations.name,
      params: simulations.params,
    })
    .from(scheduleSimulations)
    .innerJoin(simulations, eq(scheduleSimulations.simulationId, simulations.id))
    .where(inArray(scheduleSimulations.scheduleId, rows.map((r) => r.id)))
    .orderBy(asc(simulations.createdAt));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    cadence: row.cadence,
    dayOfWeek: row.dayOfWeek,
    dayOfMonth: row.dayOfMonth,
    timezone: row.timezone,
    locale: row.locale,
    active: row.active,
    nextRunAt: row.nextRunAt.toISOString(),
    lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
    consecutiveFailures: row.consecutiveFailures,
    createdAt: toISOStringOrNow(row.createdAt),
    simulations: links
      .filter((l) => l.scheduleId === row.id)
      .map((l) => {
        const params = JSON.parse(l.params);
        return {
          id: l.id,
          name: l.name,
          tickers: params.tickers ?? [],
          strategy: params.strategy ?? "max-sharpe",
        };
      }),
  }));
}

async function findOwned(id: string, userId: string) {
  return db.query.simulationSchedules.findFirst({
    where: and(eq(simulationSchedules.id, id), eq(simulationSchedules.userId, userId)),
  });
}

// GET /api/schedules - List the current user's schedules and their simulations
app.get("/", async (c) => {
  const user = c.get("user");
  const rows = await db
    .select()
    .from(simulationSchedules)
    .where(eq(simulationSchedules.userId, user.id))
    .orderBy(desc(simulationSchedules.createdAt));
  return c.json(await serializeSchedules(rows));
});

// POST /api/schedules - Create a schedule
const createSchema = z.object({
  name: z.string().max(200).nullable().optional(),
  ...timingFields,
  /** Defaults to the NEXT_LOCALE cookie; clients without one (mobile) send it. */
  locale: z.enum(["es", "en"]).optional(),
  simulationIds: z.array(z.string()).min(1),
});

app.post("/", zValidator("json", createSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  const timing = normalizeTiming(body);
  if ("error" in timing) return c.json({ error: timing.error }, 400);

  const simulationIds = [...new Set(body.simulationIds)];
  const owned = await db
    .select({ id: simulations.id, params: simulations.params })
    .from(simulations)
    .where(and(inArray(simulations.id, simulationIds), eq(simulations.userId, user.id)));

  if (owned.length !== simulationIds.length) {
    return c.json({ error: "simulation_not_found" }, 404);
  }

  // Refuse what the runner could never replay (mobile-shaped params, targets
  // missing, impossible bounds) now, with a clear answer, rather than failing
  // silently on every scheduled run.
  const now = new Date();
  const unreplayable = owned
    .filter((sim) => !planReplay(sim.params, now, timing.timezone).ok)
    .map((sim) => sim.id);
  if (unreplayable.length > 0) {
    return c.json({ error: "unreplayable_simulation", simulationIds: unreplayable }, 400);
  }

  const id = crypto.randomUUID();
  await db.insert(simulationSchedules).values({
    id,
    userId: user.id,
    name: body.name?.trim() || null,
    ...timing,
    // No request reaches the runner, so the language is fixed here.
    locale: body.locale ?? getLocaleFromRequest(c.req.raw),
    nextRunAt: computeNextRunAt(timing, now),
    createdAt: now,
    updatedAt: now,
  });
  await db
    .insert(scheduleSimulations)
    .values(simulationIds.map((simulationId) => ({ scheduleId: id, simulationId })));

  const row = await findOwned(id, user.id);
  const [serialized] = await serializeSchedules([row!]);
  return c.json(serialized, 201);
});

// PATCH /api/schedules/:id - Rename, change cadence, pause or resume
const patchSchema = z
  .object({
    name: z.string().max(200).nullable().optional(),
    cadence: timingFields.cadence.optional(),
    dayOfWeek: timingFields.dayOfWeek,
    dayOfMonth: timingFields.dayOfMonth,
    timezone: timingFields.timezone.optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((field) => field !== undefined), {
    message: "no fields to update",
  });

app.patch("/:id", zValidator("json", patchSchema), async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");
  const body = c.req.valid("json");

  const existing = await findOwned(id, user.id);
  if (!existing) return c.json({ error: "Schedule not found" }, 404);

  const now = new Date();
  const updates: Partial<SimulationSchedule> = { updatedAt: now };
  if (body.name !== undefined) updates.name = body.name?.trim() || null;

  const timingChanged =
    body.cadence !== undefined ||
    body.dayOfWeek !== undefined ||
    body.dayOfMonth !== undefined ||
    body.timezone !== undefined;
  const resuming = body.active === true && !existing.active;

  if (timingChanged) {
    const timing = normalizeTiming({
      cadence: body.cadence ?? (existing.cadence as ScheduleTiming["cadence"]),
      dayOfWeek: body.dayOfWeek !== undefined ? body.dayOfWeek : existing.dayOfWeek,
      dayOfMonth: body.dayOfMonth !== undefined ? body.dayOfMonth : existing.dayOfMonth,
      timezone: body.timezone ?? existing.timezone,
    });
    if ("error" in timing) return c.json({ error: timing.error }, 400);
    Object.assign(updates, timing);
  }

  if (body.active !== undefined) updates.active = body.active;

  if (timingChanged || resuming) {
    // A resumed schedule starts from its next slot, not from the backlog it
    // missed while paused.
    updates.nextRunAt = computeNextRunAt(
      {
        cadence: (updates.cadence ?? existing.cadence) as ScheduleTiming["cadence"],
        dayOfWeek: updates.dayOfWeek !== undefined ? updates.dayOfWeek : existing.dayOfWeek,
        dayOfMonth: updates.dayOfMonth !== undefined ? updates.dayOfMonth : existing.dayOfMonth,
        timezone: updates.timezone ?? existing.timezone,
      },
      now
    );
  }
  if (resuming) updates.consecutiveFailures = 0;

  await db
    .update(simulationSchedules)
    .set(updates)
    .where(and(eq(simulationSchedules.id, id), eq(simulationSchedules.userId, user.id)));

  const row = await findOwned(id, user.id);
  const [serialized] = await serializeSchedules([row!]);
  return c.json(serialized);
});

// DELETE /api/schedules/:id - Delete a schedule (its run history stays on the simulations)
app.delete("/:id", async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");

  const deleted = await db
    .delete(simulationSchedules)
    .where(and(eq(simulationSchedules.id, id), eq(simulationSchedules.userId, user.id)))
    .returning({ id: simulationSchedules.id });

  if (deleted.length === 0) return c.json({ error: "Schedule not found" }, 404);
  return c.json({ success: true });
});

export default app;
