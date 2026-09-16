import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "../../db/index.js";
import { customBenchmarks } from "../../db/schema.js";
import { authMiddleware } from "../../middleware/auth.js";
import {
  MAX_CUSTOM_BENCHMARKS_PER_USER,
  MAX_CUSTOM_BENCHMARK_COMPONENTS,
  customBenchmarkId,
  type BenchmarkComponent,
} from "../../lib/benchmarks.js";
import { defaultLookbackPeriod } from "../../lib/dates.js";
import { fetchTickerPrices } from "../../lib/yahoo.js";

/**
 * CRUD for user-authored benchmarks. Mounted under the optimization routes, so
 * the whole benchmark surface — catalog, comparison, and the user's own
 * additions to it — sits at one prefix.
 */
const app = new Hono();

app.use("*", authMiddleware);

/**
 * A leg may be levered or short, but not unbounded: 5x either way is already
 * past anything a reference portfolio should express.
 */
const componentSchema = z.object({
  ticker: z.string().trim().min(1).max(20),
  weight: z.number().finite().min(-5).max(5),
});

const bodySchema = z.object({
  name: z.string().trim().min(1).max(60),
  components: z.array(componentSchema).min(1).max(MAX_CUSTOM_BENCHMARK_COMPONENTS),
});

type Body = z.infer<typeof bodySchema>;

/**
 * Uppercases symbols the way Yahoo returns them and rejects a benchmark that
 * names the same one twice — two legs on one ticker is always a mistake, and
 * silently merging them would hide it.
 */
function normalizeComponents(components: Body["components"]): BenchmarkComponent[] | null {
  const seen = new Set<string>();
  const normalized: BenchmarkComponent[] = [];
  for (const component of components) {
    const ticker = component.ticker.toUpperCase();
    if (seen.has(ticker)) return null;
    seen.add(ticker);
    normalized.push({ ticker, weight: component.weight });
  }
  return normalized;
}

/**
 * Symbols Yahoo cannot price over the default window. Checked up front because
 * a benchmark that can never be drawn is worth catching while the user still
 * has the form open, rather than as an "unavailable" note on every later
 * comparison.
 */
async function unpricedTickers(components: BenchmarkComponent[]): Promise<string[]> {
  const { period1, period2 } = defaultLookbackPeriod();
  const tickers = components.map((component) => component.ticker);

  let pricesByTicker: Map<string, { date: string; close: number }[]>;
  try {
    pricesByTicker = await fetchTickerPrices(tickers, period1, period2);
  } catch {
    // Yahoo being down is not the user's mistake — let the benchmark be saved
    // and let the comparison endpoint report what it cannot price.
    return [];
  }

  return tickers.filter((ticker) => (pricesByTicker.get(ticker)?.length ?? 0) < 2);
}

function toResponse(row: typeof customBenchmarks.$inferSelect) {
  return {
    id: customBenchmarkId(row.id),
    name: row.name,
    components: JSON.parse(row.components) as BenchmarkComponent[],
  };
}

// The user's own benchmarks are read back through GET /benchmarks alongside the
// built-in catalog, so there is deliberately no list route here — one read path
// keeps the picker and the editor from drifting apart.

// POST /api/optimization/custom-benchmarks - Create one
app.post("/", zValidator("json", bodySchema), async (c) => {
  const user = c.get("user");
  const { name, components } = c.req.valid("json");

  const normalized = normalizeComponents(components);
  if (!normalized) {
    return c.json({ error: "duplicate_ticker" }, 400);
  }

  const existing = await db
    .select({ id: customBenchmarks.id })
    .from(customBenchmarks)
    .where(eq(customBenchmarks.userId, user.id));

  if (existing.length >= MAX_CUSTOM_BENCHMARKS_PER_USER) {
    return c.json({ error: "limit_reached", limit: MAX_CUSTOM_BENCHMARKS_PER_USER }, 400);
  }

  const unpriced = await unpricedTickers(normalized);
  if (unpriced.length > 0) {
    // `detail` carries the symbols through ApiError.message, which is where the
    // client reads them from to name them in the form.
    return c.json({ error: "unpriced_tickers", detail: unpriced.join(", ") }, 400);
  }

  const [row] = await db
    .insert(customBenchmarks)
    .values({
      id: randomUUID(),
      userId: user.id,
      name,
      components: JSON.stringify(normalized),
    })
    .returning();

  return c.json(toResponse(row), 201);
});

// PUT /api/optimization/custom-benchmarks/:id - Replace one
app.put("/:id", zValidator("json", bodySchema), async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();
  const { name, components } = c.req.valid("json");

  const normalized = normalizeComponents(components);
  if (!normalized) {
    return c.json({ error: "duplicate_ticker" }, 400);
  }

  const unpriced = await unpricedTickers(normalized);
  if (unpriced.length > 0) {
    return c.json({ error: "unpriced_tickers", detail: unpriced.join(", ") }, 400);
  }

  const [row] = await db
    .update(customBenchmarks)
    .set({
      name,
      components: JSON.stringify(normalized),
      updatedAt: new Date(),
    })
    .where(and(eq(customBenchmarks.id, id), eq(customBenchmarks.userId, user.id)))
    .returning();

  if (!row) {
    return c.json({ error: "Custom benchmark not found" }, 404);
  }

  return c.json(toResponse(row));
});

// DELETE /api/optimization/custom-benchmarks/:id
app.delete("/:id", async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();

  const [row] = await db
    .delete(customBenchmarks)
    .where(and(eq(customBenchmarks.id, id), eq(customBenchmarks.userId, user.id)))
    .returning({ id: customBenchmarks.id });

  if (!row) {
    return c.json({ error: "Custom benchmark not found" }, 404);
  }

  return c.json({ success: true });
});

export default app;
