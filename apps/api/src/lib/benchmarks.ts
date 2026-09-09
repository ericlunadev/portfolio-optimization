import type { PricePoint } from "./yahoo.js";
import { mean, stdDev } from "./math/stats.js";

/** Trading days in a year, matching the annualization used by the optimizer. */
const TRADING_DAYS = 252;

/**
 * Volatility below which a series counts as flat. A steady climb leaves float
 * noise on the order of 1e-17 rather than a clean zero, and dividing by that
 * turns the Sharpe ratio into a meaningless astronomical number.
 */
const FLAT_VOLATILITY = 1e-12;

export type BenchmarkCategory =
  | "equity"
  | "global"
  | "diversified"
  | "portfolio"
  | "custom";

/** One leg of a benchmark. Single-leg benchmarks are plain indices. */
export interface BenchmarkComponent {
  ticker: string;
  weight: number;
}

/**
 * A reference portfolio a simulation can be measured against. Labels live in
 * the web app's translation files, keyed by `id` — the catalog itself carries
 * no user-facing text.
 *
 * `name` is the exception: a user-authored benchmark has no translation to key
 * off, so it carries its own label.
 */
export interface BenchmarkDefinition {
  id: string;
  category: BenchmarkCategory;
  components: BenchmarkComponent[];
  name?: string;
}

const index = (
  id: string,
  ticker: string,
  category: BenchmarkCategory
): BenchmarkDefinition => ({
  id,
  category,
  components: [{ ticker, weight: 1 }],
});

/**
 * Curated benchmarks. Yahoo's search endpoint filters quotes down to equities
 * and ETFs, so index symbols cannot be reached through the asset picker — this
 * catalog is how a user gets at them.
 */
/**
 * The naive 1/N portfolio over the simulation's *own* assets — the baseline any
 * optimizer has to beat to have earned its complexity. Its legs depend on the
 * request, so the catalog entry carries none and
 * {@link resolveBenchmarkComponents} fills them in.
 */
export const EQUAL_WEIGHT_ID = "equal-weight";

export const BENCHMARKS: BenchmarkDefinition[] = [
  { id: EQUAL_WEIGHT_ID, category: "portfolio", components: [] },
  index("sp500", "^GSPC", "equity"),
  // Same 500 companies as ^GSPC, weighted 1/N instead of by market cap — a
  // read on how much of the index's return came from its largest names.
  index("sp500-equal-weight", "RSP", "equity"),
  index("nasdaq-100", "^NDX", "equity"),
  index("dow-jones", "^DJI", "equity"),
  index("russell-2000", "^RUT", "equity"),
  index("ipc-mexico", "^MXX", "equity"),
  // The ETF rather than ^STOXX50E: Yahoo returns a null currency on the index
  // itself, which the client rejects as a malformed quote.
  index("euro-stoxx-50", "FEZ", "equity"),
  index("ftse-100", "^FTSE", "equity"),
  index("nikkei-225", "^N225", "equity"),
  index("msci-world", "URTH", "global"),
  index("emerging-markets", "EEM", "global"),
  {
    id: "classic-60-40",
    category: "diversified",
    components: [
      { ticker: "SPY", weight: 0.6 },
      { ticker: "AGG", weight: 0.4 },
    ],
  },
  index("us-bonds", "AGG", "diversified"),
  index("gold", "GLD", "diversified"),
  index("bitcoin", "BTC-USD", "diversified"),
];

const BENCHMARKS_BY_ID = new Map(BENCHMARKS.map((b) => [b.id, b]));

export function findBenchmark(id: string): BenchmarkDefinition | undefined {
  return BENCHMARKS_BY_ID.get(id);
}

/** Every distinct symbol the given benchmarks need, for one batched fetch. */
export function benchmarkTickers(definitions: BenchmarkDefinition[]): string[] {
  const tickers = new Set<string>();
  for (const definition of definitions) {
    for (const component of definition.components) {
      tickers.add(component.ticker);
    }
  }
  return Array.from(tickers);
}

/**
 * The legs to actually price for a benchmark. Every definition but the
 * equal-weight one already knows its own; that one spreads the portfolio's
 * assets evenly, so it only exists relative to a given simulation.
 */
export function resolveBenchmarkComponents(
  definition: BenchmarkDefinition,
  portfolioTickers: string[]
): BenchmarkComponent[] {
  if (definition.id !== EQUAL_WEIGHT_ID) return definition.components;

  const tickers = Array.from(new Set(portfolioTickers));
  if (tickers.length === 0) return [];
  return tickers.map((ticker) => ({ ticker, weight: 1 / tickers.length }));
}

// ==================== CUSTOM BENCHMARKS ====================

/**
 * Ids of user-authored benchmarks are namespaced so they can never collide with
 * a catalog id, present or future, and so a saved simulation's selection stays
 * readable without a database lookup.
 */
const CUSTOM_PREFIX = "custom:";

/** How many legs one custom benchmark may hold. */
export const MAX_CUSTOM_BENCHMARK_COMPONENTS = 10;

/** How many custom benchmarks one user may keep. */
export const MAX_CUSTOM_BENCHMARKS_PER_USER = 20;

export function customBenchmarkId(rowId: string): string {
  return `${CUSTOM_PREFIX}${rowId}`;
}

/** The row id behind a namespaced id, or `null` if it is not a custom one. */
export function parseCustomBenchmarkId(id: string): string | null {
  return id.startsWith(CUSTOM_PREFIX) ? id.slice(CUSTOM_PREFIX.length) : null;
}

export interface CustomBenchmarkRow {
  id: string;
  name: string;
  components: string;
}

/**
 * Turns a stored row into a definition. Returns `null` when the stored JSON is
 * unusable, so one corrupt row cannot take down the whole catalog.
 */
export function customBenchmarkDefinition(
  row: CustomBenchmarkRow
): BenchmarkDefinition | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.components);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const components: BenchmarkComponent[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) return null;
    const { ticker, weight } = entry as Record<string, unknown>;
    if (typeof ticker !== "string" || typeof weight !== "number") return null;
    if (!Number.isFinite(weight)) return null;
    components.push({ ticker, weight });
  }
  if (components.length === 0) return null;

  return {
    id: customBenchmarkId(row.id),
    category: "custom",
    components,
    name: row.name,
  };
}

export interface SeriesPoint {
  date: string;
  value: number;
}

export interface PerformanceSeries {
  /** Cumulative return from the first common date, as a decimal (0 = flat). */
  points: SeriesPoint[];
  /** Annualized mean of daily log returns. */
  expectedReturn: number;
  /** Annualized standard deviation of daily log returns. */
  volatility: number;
  sharpeRatio: number;
  /** Deepest peak-to-trough fall over the window, as a negative decimal. */
  maxDrawdown: number;
  /** Cumulative return across the whole window. */
  totalReturn: number;
}

/**
 * Cumulative performance of a daily-rebalanced basket, restricted to the dates
 * every leg has a price for.
 *
 * Weights are literal exposures, not shares of a whole: a basket summing to
 * less than 1 holds the rest in cash at 0%, and one summing to more than 1 is
 * levered. Normalizing instead would silently rewrite an 80%-invested
 * portfolio as a fully invested one.
 *
 * Returns `null` when the legs share fewer than two dates — there is no series
 * to draw and no return to annualize.
 */
export function buildWeightedSeries(
  components: BenchmarkComponent[],
  pricesByTicker: Map<string, PricePoint[]>,
  riskFreeRate = 0
): PerformanceSeries | null {
  if (components.length === 0) return null;

  const closesByComponent: Map<string, number>[] = [];
  for (const component of components) {
    const prices = pricesByTicker.get(component.ticker);
    if (!prices || prices.length < 2) return null;
    closesByComponent.push(new Map(prices.map((p) => [p.date, p.close])));
  }

  const dates = closesByComponent
    .reduce<string[]>(
      (common, closes) => common.filter((date) => closes.has(date)),
      Array.from(closesByComponent[0].keys())
    )
    .sort();

  if (dates.length < 2) return null;

  const weights = components.map((c) => c.weight);

  // Daily simple returns of the basket, rebalanced back to `weights` each day.
  const dailyReturns: number[] = [];
  for (let t = 1; t < dates.length; t++) {
    let basketReturn = 0;
    for (let i = 0; i < components.length; i++) {
      const previous = closesByComponent[i].get(dates[t - 1])!;
      const current = closesByComponent[i].get(dates[t])!;
      if (previous === 0) return null;
      basketReturn += weights[i] * (current / previous - 1);
    }
    dailyReturns.push(basketReturn);
  }

  // Compound into a cumulative series, tracking the deepest fall on the way.
  const points: SeriesPoint[] = [{ date: dates[0], value: 0 }];
  let wealth = 1;
  let peak = 1;
  let maxDrawdown = 0;
  for (let t = 0; t < dailyReturns.length; t++) {
    wealth *= 1 + dailyReturns[t];
    peak = Math.max(peak, wealth);
    maxDrawdown = Math.min(maxDrawdown, wealth / peak - 1);
    points.push({ date: dates[t + 1], value: wealth - 1 });
  }

  // Annualized the same way as the optimizer's asset assumptions — log returns,
  // mean x 252 and stdev x sqrt(252) — so the figures sit on the same scale as
  // the ones on the result's stat cards.
  const logReturns = dailyReturns.map((r) => Math.log(1 + r));
  const expectedReturn = mean(logReturns) * TRADING_DAYS;
  const volatility = stdDev(logReturns) * Math.sqrt(TRADING_DAYS);

  return {
    points,
    expectedReturn,
    volatility,
    sharpeRatio:
      volatility > FLAT_VOLATILITY ? (expectedReturn - riskFreeRate) / volatility : 0,
    maxDrawdown,
    totalReturn: wealth - 1,
  };
}
