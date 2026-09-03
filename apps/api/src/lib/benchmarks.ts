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

export type BenchmarkCategory = "equity" | "global" | "diversified";

/** One leg of a benchmark. Single-leg benchmarks are plain indices. */
export interface BenchmarkComponent {
  ticker: string;
  weight: number;
}

/**
 * A reference portfolio a simulation can be measured against. Labels live in
 * the web app's translation files, keyed by `id` — the catalog itself carries
 * no user-facing text.
 */
export interface BenchmarkDefinition {
  id: string;
  category: BenchmarkCategory;
  components: BenchmarkComponent[];
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
export const BENCHMARKS: BenchmarkDefinition[] = [
  index("sp500", "^GSPC", "equity"),
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
