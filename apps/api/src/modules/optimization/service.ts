import { z } from "zod";
import { runStrategy } from "../../lib/math/run-strategy.js";
import { OPTIMIZATION_STRATEGIES, type OptimizationStrategy } from "../../lib/math/strategies.js";
import { buildCovarianceMatrix } from "../../lib/math/matrix.js";
import { correlationMatrix, normalCDF, stdDev, mean } from "../../lib/math/stats.js";
import { defaultLookbackPeriod } from "../../lib/dates.js";
import { fetchTickerPrices } from "../../lib/yahoo.js";

/**
 * The optimization itself, free of HTTP.
 *
 * `POST /api/optimization/optimize` and the scheduled-simulation runner both
 * call `runOptimization`. The route owns what only a request has — the session,
 * the `Idempotency-Key` header, the 400 responses — and the runner owns its own
 * metering, so neither concern lives here.
 */

/**
 * Per-asset weight bounds, aligned index-for-index with `tickers`. A `null`
 * entry falls back to the portfolio-wide `w_max` (and to 0, or `-w_max` with
 * short selling, for the minimum).
 */
export const perAssetBoundSchema = z.array(z.number().min(-1).max(1).nullable()).optional();

export const optimizeRequestSchema = z.object({
  tickers: z.array(z.string()).min(1),
  strategy: z.enum(OPTIMIZATION_STRATEGIES),
  w_max: z.number().min(0).max(1).default(1.0),
  w_min_per_asset: perAssetBoundSchema,
  w_max_per_asset: perAssetBoundSchema,
  risk_free_rate: z.number().min(0).default(0),
  target_return: z.number().optional(),
  target_risk: z.number().optional(),
  /** Tail cut-off for the `cvar` strategy: 0.95 averages the worst 5%. */
  cvar_confidence: z.number().min(0.5).max(0.999).default(0.95),
  /** How far `black-litterman` leans on the history over equilibrium. */
  view_confidence: z.number().min(0).max(1).default(0.5),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  enforce_full_investment: z.boolean().default(true),
  allow_short_selling: z.boolean().default(false),
  max_leverage: z.number().min(1).max(3).default(1.0),
});

export type OptimizeParams = z.output<typeof optimizeRequestSchema>;

export interface OptimizeResponse {
  weights: {
    fund_id: number;
    fund_name: string;
    weight: number;
    exp_ret: number;
    volatility: number;
  }[];
  expected_return: number;
  volatility: number;
  sharpe_ratio: number;
  strategy: OptimizationStrategy;
  /** Annualized covariances, in the same asset order as `weights`. */
  covariance_matrix: number[][];
  stats: {
    ci_95_low: number;
    ci_95_high: number;
    prob_neg_1m: number;
    prob_neg_3m: number;
    prob_neg_1y: number;
    prob_neg_2y: number;
  };
}

/**
 * Run one optimization. Throws `MissingStrategyTargetError` (from
 * `run-strategy.ts`) when a target strategy arrives without its target, so a
 * caller with no HTTP response to return can still tell a bad input from a
 * failed computation.
 */
export async function runOptimization(params: OptimizeParams): Promise<OptimizeResponse> {
  const {
    tickers,
    strategy,
    w_max,
    w_min_per_asset,
    w_max_per_asset,
    risk_free_rate,
    target_return,
    target_risk,
    cvar_confidence,
    view_confidence,
    start_date,
    end_date,
    enforce_full_investment,
    allow_short_selling,
    max_leverage,
  } = params;

  const { expectedReturns, volatilities, corrMatrix, dailyReturns } =
    await getTickerAssumptions(tickers, start_date, end_date);
  const covMatrix = buildCovarianceMatrix(volatilities, corrMatrix);

  const result = runStrategy({
    strategy,
    expectedReturns,
    covMatrix,
    dailyReturns,
    constraints: {
      wMax: w_max,
      wMinPerAsset: w_min_per_asset,
      wMaxPerAsset: w_max_per_asset,
      enforceFullInvestment: enforce_full_investment,
      allowShortSelling: allow_short_selling,
      maxLeverage: max_leverage,
    },
    riskFreeRate: risk_free_rate,
    targetReturn: target_return,
    targetRisk: target_risk,
    cvarConfidence: cvar_confidence,
    viewConfidence: view_confidence,
  });

  const weights = tickers.map((ticker, i) => ({
    fund_id: i,
    fund_name: ticker,
    weight: result.weights[i],
    exp_ret: expectedReturns[i],
    volatility: volatilities[i],
  }));

  const calcProbNeg = (months: number) => {
    const timeInYears = months / 12;
    const meanT = result.return * timeInYears;
    const volT = result.volatility * Math.sqrt(timeInYears);
    const zScore = -meanT / volT;
    return normalCDF(zScore);
  };

  const sharpeRatio =
    result.sharpeRatio ??
    (result.volatility > 0 ? (result.return - risk_free_rate) / result.volatility : 0);

  return {
    weights,
    expected_return: result.return,
    volatility: result.volatility,
    sharpe_ratio: sharpeRatio,
    strategy,
    covariance_matrix: covMatrix,
    stats: {
      ci_95_low: result.return - 1.96 * result.volatility,
      ci_95_high: result.return + 1.96 * result.volatility,
      prob_neg_1m: calcProbNeg(1),
      prob_neg_3m: calcProbNeg(3),
      prob_neg_1y: calcProbNeg(12),
      prob_neg_2y: calcProbNeg(24),
    },
  };
}

// Helper function to get assumptions for tickers from Yahoo Finance
export async function getTickerAssumptions(tickers: string[], startDate?: string, endDate?: string): Promise<{
  expectedReturns: number[];
  volatilities: number[];
  corrMatrix: number[][];
  /**
   * Daily log returns per ticker, indexed `[asset][day]` and trimmed so every
   * ticker covers the same days. Strategies that read the return distribution
   * directly rather than summarizing it — CVaR — need the raw series.
   */
  dailyReturns: number[][];
}> {
  const defaults = defaultLookbackPeriod();
  const pricesByTicker = await fetchTickerPrices(
    tickers,
    startDate || defaults.period1,
    endDate || defaults.period2
  );

  // Calculate daily log returns for each ticker
  const dailyReturnsByTicker: number[][] = [];

  for (const ticker of tickers) {
    const prices = pricesByTicker.get(ticker) ?? [];
    const returns: number[] = [];

    for (let i = 1; i < prices.length; i++) {
      returns.push(Math.log(prices[i].close / prices[i - 1].close));
    }

    dailyReturnsByTicker.push(returns);
  }

  // Find minimum common length and trim
  let minLen = Infinity;
  for (const returns of dailyReturnsByTicker) {
    minLen = Math.min(minLen, returns.length);
  }

  const trimmedReturns = dailyReturnsByTicker.map((returns) => returns.slice(-minLen));

  // Calculate expected returns and volatilities (annualized from daily)
  const expectedReturns: number[] = [];
  const volatilities: number[] = [];

  for (const returns of trimmedReturns) {
    const avgDailyReturn = returns.length > 0 ? mean(returns) : 0;
    const dailyVol = returns.length > 0 ? stdDev(returns) : 0.05;

    expectedReturns.push(avgDailyReturn * 252);
    volatilities.push(dailyVol * Math.sqrt(252));
  }

  // Calculate correlation matrix
  const corrMatrix = correlationMatrix(trimmedReturns);

  return { expectedReturns, volatilities, corrMatrix, dailyReturns: trimmedReturns };
}
