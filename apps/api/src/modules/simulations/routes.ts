import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { db } from "../../db/index.js";
import { simulations } from "../../db/schema.js";
import { optionalAuthMiddleware } from "../../middleware/auth.js";

const app = new Hono();

// All routes use optional auth (simulations work without login too)
app.use("*", optionalAuthMiddleware);

// GET /api/simulations - List all simulations
app.get("/", async (c) => {
  const rows = await db
    .select()
    .from(simulations)
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

  const row = await db.query.simulations.findFirst({
    where: eq(simulations.id, id),
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

  // Auto-generate name if not provided
  const name =
    body.name ||
    generateSimulationName(params);

  const id = crypto.randomUUID();
  const user = c.get("optionalUser");

  await db.insert(simulations).values({
    id,
    userId: user?.id ?? null,
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

// DELETE /api/simulations/:id - Delete a simulation
app.delete("/:id", async (c) => {
  const { id } = c.req.param();

  const row = await db.query.simulations.findFirst({
    where: eq(simulations.id, id),
  });

  if (!row) {
    return c.json({ error: "Simulation not found" }, 404);
  }

  await db.delete(simulations).where(eq(simulations.id, id));

  return c.json({ success: true });
});

function generateSimulationName(params: Record<string, unknown>): string {
  const tickers = (params.tickers as string[]) ?? [];
  const strategy = (params.strategy as string) ?? "max-sharpe";

  const strategyLabels: Record<string, string> = {
    "max-sharpe": "Máximo Sharpe",
    "min-risk": "Mínimo Riesgo",
    "max-return": "Máximo Rendimiento",
    "target-return": "Rendimiento Objetivo",
    "target-risk": "Riesgo Objetivo",
    "knee-point": "Punto de Inflexión",
  };

  const tickerStr =
    tickers.length <= 4
      ? tickers.join(", ")
      : `${tickers.slice(0, 3).join(", ")} +${tickers.length - 3}`;

  const strategyLabel = strategyLabels[strategy] ?? strategy;

  return `${tickerStr} - ${strategyLabel}`;
}

export default app;
