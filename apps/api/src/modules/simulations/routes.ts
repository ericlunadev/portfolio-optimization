import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, desc } from "drizzle-orm";
import { db } from "../../db/index.js";
import { simulations } from "../../db/schema.js";
import { authMiddleware } from "../../middleware/auth.js";
import { toISOStringOrNow } from "../../lib/dates.js";

const app = new Hono();

// All simulation routes require authentication and are scoped per user
app.use("*", authMiddleware);

// GET /api/simulations - List all simulations for the current user
app.get("/", async (c) => {
  const user = c.get("user");

  const rows = await db
    .select()
    .from(simulations)
    .where(eq(simulations.userId, user.id))
    .orderBy(desc(simulations.pinned), desc(simulations.createdAt));

  const items = rows.map((row) => {
    const params = JSON.parse(row.params);
    const result = JSON.parse(row.result);
    return {
      id: row.id,
      name: row.name,
      tickers: params.tickers ?? [],
      strategy: params.strategy ?? "max-sharpe",
      expectedReturn: result.expected_return ?? 0,
      volatility: result.volatility ?? 0,
      sharpeRatio: result.sharpe_ratio ?? 0,
      params,
      pinned: row.pinned,
      createdAt: toISOStringOrNow(row.createdAt),
    };
  });

  return c.json(items);
});

// GET /api/simulations/:id - Get full simulation details
app.get("/:id", async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");

  const row = await db.query.simulations.findFirst({
    where: and(eq(simulations.id, id), eq(simulations.userId, user.id)),
  });

  if (!row) {
    return c.json({ error: "Simulation not found" }, 404);
  }

  return c.json({
    id: row.id,
    name: row.name,
    params: JSON.parse(row.params),
    result: JSON.parse(row.result),
    createdAt: toISOStringOrNow(row.createdAt),
  });
});

// POST /api/simulations - Save a new simulation
const createSchema = z.object({
  name: z.string().optional(),
  params: z.object({}).passthrough(),
  result: z.object({}).passthrough(),
});

app.post("/", zValidator("json", createSchema), async (c) => {
  const body = c.req.valid("json");

  const params = body.params as Record<string, unknown>;
  const result = body.result as Record<string, unknown>;

  const name = body.name?.trim() || null;

  const id = crypto.randomUUID();
  const user = c.get("user");

  await db.insert(simulations).values({
    id,
    userId: user.id,
    name,
    params: JSON.stringify(params),
    result: JSON.stringify(result),
  });

  const row = await db.query.simulations.findFirst({
    where: eq(simulations.id, id),
  });

  return c.json(
    {
      id: row!.id,
      name: row!.name,
      params: JSON.parse(row!.params),
      result: JSON.parse(row!.result),
      createdAt: toISOStringOrNow(row!.createdAt),
    },
    201
  );
});

// PATCH /api/simulations/:id - Update name and/or pinned state of a simulation
const patchSchema = z
  .object({
    name: z.string().max(200).nullable().optional(),
    pinned: z.boolean().optional(),
  })
  .refine((v) => v.name !== undefined || v.pinned !== undefined, {
    message: "name or pinned required",
  });

app.patch("/:id", zValidator("json", patchSchema), async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");
  const body = c.req.valid("json");

  const updates: { name?: string | null; pinned?: boolean } = {};
  if (body.name !== undefined) updates.name = body.name?.trim() || null;
  if (body.pinned !== undefined) updates.pinned = body.pinned;

  const updated = await db
    .update(simulations)
    .set(updates)
    .where(and(eq(simulations.id, id), eq(simulations.userId, user.id)))
    .returning({
      id: simulations.id,
      name: simulations.name,
      pinned: simulations.pinned,
    });

  if (updated.length === 0) {
    return c.json({ error: "Simulation not found" }, 404);
  }

  return c.json(updated[0]);
});

// PUT /api/simulations/:id - Replace params + result on an existing simulation (used by re-run)
const putSchema = z.object({
  params: z.object({}).passthrough(),
  result: z.object({}).passthrough(),
});

app.put("/:id", zValidator("json", putSchema), async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");
  const body = c.req.valid("json");

  const params = body.params as Record<string, unknown>;
  const result = body.result as Record<string, unknown>;

  const updated = await db
    .update(simulations)
    .set({
      params: JSON.stringify(params),
      result: JSON.stringify(result),
    })
    .where(and(eq(simulations.id, id), eq(simulations.userId, user.id)))
    .returning({ id: simulations.id });

  if (updated.length === 0) {
    return c.json({ error: "Simulation not found" }, 404);
  }

  const row = await db.query.simulations.findFirst({
    where: and(eq(simulations.id, id), eq(simulations.userId, user.id)),
  });

  return c.json({
    id: row!.id,
    name: row!.name,
    params: JSON.parse(row!.params),
    result: JSON.parse(row!.result),
    createdAt: toISOStringOrNow(row!.createdAt),
  });
});

// DELETE /api/simulations/:id - Delete a simulation owned by the current user
app.delete("/:id", async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");

  const deleted = await db
    .delete(simulations)
    .where(and(eq(simulations.id, id), eq(simulations.userId, user.id)))
    .returning({ id: simulations.id });

  if (deleted.length === 0) {
    return c.json({ error: "Simulation not found" }, 404);
  }

  return c.json({ success: true });
});

export default app;
