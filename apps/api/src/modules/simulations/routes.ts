import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, desc } from "drizzle-orm";
import { db } from "../../db/index.js";
import { simulations } from "../../db/schema.js";
import { authMiddleware } from "../../middleware/auth.js";

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
    .orderBy(desc(simulations.createdAt));

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
      createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
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
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
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
      createdAt: row!.createdAt?.toISOString() ?? new Date().toISOString(),
    },
    201
  );
});

// PATCH /api/simulations/:id - Rename a simulation owned by the current user
const patchSchema = z.object({
  name: z.string().max(200).nullable(),
});

app.patch("/:id", zValidator("json", patchSchema), async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");
  const body = c.req.valid("json");

  const row = await db.query.simulations.findFirst({
    where: and(eq(simulations.id, id), eq(simulations.userId, user.id)),
  });

  if (!row) {
    return c.json({ error: "Simulation not found" }, 404);
  }

  const name = body.name?.trim() || null;

  await db
    .update(simulations)
    .set({ name })
    .where(and(eq(simulations.id, id), eq(simulations.userId, user.id)));

  return c.json({ id, name });
});

// DELETE /api/simulations/:id - Delete a simulation owned by the current user
app.delete("/:id", async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");

  const row = await db.query.simulations.findFirst({
    where: and(eq(simulations.id, id), eq(simulations.userId, user.id)),
  });

  if (!row) {
    return c.json({ error: "Simulation not found" }, 404);
  }

  await db
    .delete(simulations)
    .where(and(eq(simulations.id, id), eq(simulations.userId, user.id)));

  return c.json({ success: true });
});

export default app;
