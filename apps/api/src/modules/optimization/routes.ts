import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  calculateEfficientFrontier,
  findMaxSharpePortfolio,
  findMinVariancePortfolio,
} from "../../lib/math/optimizer.js";
import {
  requiredTargetField,
  runStrategy,
} from "../../lib/math/run-strategy.js";
import { OPTIMIZATION_STRATEGIES } from "../../lib/math/strategies.js";
import { buildCovarianceMatrix } from "../../lib/math/matrix.js";
import { validateAssetBounds } from "../../lib/math/bounds.js";
import { correlationMatrix, normalCDF, stdDev, mean, rollingStdDev } from "../../lib/math/stats.js";
import { authMiddleware } from "../../middleware/auth.js";
import { meterRequest, clientIdempotencyKey, reverseSpendOnError } from "../../lib/billing/metering.js";
import { HTTPException } from "hono/http-exception";
import { getFundAllowlist, isTickerAllowed } from "../../lib/tenant-settings.js";
import { defaultLookbackPeriod } from "../../lib/dates.js";
import { fetchTickerPrices } from "../../lib/yahoo.js";
import {
  BENCHMARKS,
  benchmarkTickers,
  buildWeightedSeries,
  customBenchmarkDefinition,
  findBenchmark,
  parseCustomBenchmarkId,
  resolveBenchmarkComponents,
  type BenchmarkDefinition,
} from "../../lib/benchmarks.js";
import customBenchmarkRoutes from "./custom-benchmarks.js";
import { db } from "../../db/index.js";
import { customBenchmarks, simulations } from "../../db/schema.js";
import { and, eq } from "drizzle-orm";
import { readScope } from "../simulations/routes.js";
import {
  frontierRequestFromSimulationParams,
  frontierRequestSchema,
  spendForSavedFrontier,
  type FrontierRequest,
} from "./saved-frontier.js";

const optimization = new Hono();


// Search-box filtering is discovery only: nothing stops a disallowed ticker being
// posted straight to these routes. This is where a tenant's allowlist becomes an
// actual boundary rather than a UI convenience.
//
// Runs before the credit is metered - refusing a request the caller has already
// paid for would be worse than not refusing it at all.
async function assertTickersAllowed(
  organizationId: string,
  tickers: string[]
): Promise<void> {
  const allowlist = await getFundAllowlist(organizationId);
  if (!allowlist) return;

  const refused = tickers.filter((ticker) => !isTickerAllowed(allowlist, ticker));
  if (refused.length > 0) {
    throw new HTTPException(400, {
      message: `INSTRUMENT_NOT_ALLOWED: ${refused.join(", ")}`,
    });
  }
}

/**
 * Per-asset weight bounds, aligned index-for-index with `tickers`. A `null`
 * entry falls back to the portfolio-wide `w_max` (and to 0, or `-w_max` with
 * short selling, for the minimum).
 */
const perAssetBoundSchema = z.array(z.number().min(-1).max(1).nullable()).optional();

// All optimization endpoints require authentication
optimization.use("*", authMiddleware);

// POST /api/optimization/optimize - Unified optimization endpoint supporting all strategies
optimization.post(
  "/optimize",
  zValidator(
    "json",
    z.object({
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
    })
  ),
  async (c) => {
    const body = c.req.valid("json");

    // Validate the weight bounds before metering: an infeasible floor/cap
    // combination is a bad request, and the user should not be charged for it.
    const boundsError = validateAssetBounds(body);
    if (boundsError) {
      return c.json(boundsError, 400);
    }

    // Same for a strategy asked for without the target it needs: the request
    // was never going to produce a portfolio, so it should not cost a credit.
    const requiredField = requiredTargetField(body.strategy);
    if (requiredField && body[requiredField] === undefined) {
      return c.json(
        {
          error: "missing_strategy_target",
          detail: `${requiredField} is required for the ${body.strategy} strategy.`,
        },
        400
      );
    }

    const user = c.get("user");
    const organizationId = c.get("organizationId");
    await assertTickersAllowed(organizationId, c.req.valid("json").tickers);
    const idempotencyKey = clientIdempotencyKey(c.req.header("Idempotency-Key"));
    const spend = await meterRequest({ organizationId, user, cost: 1, idempotencyKey });

    try {
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
    } = body;

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

    return c.json({
      weights,
      expected_return: result.return,
      volatility: result.volatility,
      sharpe_ratio: sharpeRatio,
      strategy,
      // Annualized covariances, in the same asset order as `weights`.
      covariance_matrix: covMatrix,
      stats: {
        ci_95_low: result.return - 1.96 * result.volatility,
        ci_95_high: result.return + 1.96 * result.volatility,
        prob_neg_1m: calcProbNeg(1),
        prob_neg_3m: calcProbNeg(3),
        prob_neg_1y: calcProbNeg(12),
        prob_neg_2y: calcProbNeg(24),
      },
    });
    } catch (err) {
      await reverseSpendOnError(spend, "optimize_failed");
      throw err;
    }
  }
);

// POST /api/optimization/min-variance-tickers - Calculate minimum variance portfolio using tickers
optimization.post(
  "/min-variance-tickers",
  zValidator(
    "json",
    z.object({
      tickers: z.array(z.string()),
      r_min: z.number().min(0).max(1),
      w_max: z.number().min(0).max(1).default(1.0),
      w_min_per_asset: perAssetBoundSchema,
      w_max_per_asset: perAssetBoundSchema,
      start_date: z.string().optional(),
      end_date: z.string().optional(),
      // Constraint toggles
      enforce_full_investment: z.boolean().default(true),
      allow_short_selling: z.boolean().default(false),
      max_leverage: z.number().min(1).max(3).default(1.0),
    })
  ),
  async (c) => {
    // Validate the weight bounds before metering: an infeasible floor/cap
    // combination is a bad request, and the user should not be charged for it.
    const boundsError = validateAssetBounds(c.req.valid("json"));
    if (boundsError) {
      return c.json(boundsError, 400);
    }

    const user = c.get("user");
    const organizationId = c.get("organizationId");
    await assertTickersAllowed(organizationId, c.req.valid("json").tickers);
    const idempotencyKey = clientIdempotencyKey(c.req.header("Idempotency-Key"));
    const spend = await meterRequest({ organizationId, user, cost: 1, idempotencyKey });

    try {
    const {
      tickers,
      r_min,
      w_max,
      w_min_per_asset,
      w_max_per_asset,
      start_date,
      end_date,
      enforce_full_investment,
      allow_short_selling,
      max_leverage,
    } = c.req.valid("json");

    const { expectedReturns, volatilities, corrMatrix } = await getTickerAssumptions(tickers, start_date, end_date);
    const covMatrix = buildCovarianceMatrix(volatilities, corrMatrix);

    const result = findMinVariancePortfolio(expectedReturns, covMatrix, {
      rMin: r_min,
      wMax: w_max,
      wMinPerAsset: w_min_per_asset,
      wMaxPerAsset: w_max_per_asset,
      enforceFullInvestment: enforce_full_investment,
      allowShortSelling: allow_short_selling,
      maxLeverage: max_leverage,
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

    return c.json({
      weights,
      expected_return: result.return,
      volatility: result.volatility,
      stats: {
        ci_95_low: result.return - 1.96 * result.volatility,
        ci_95_high: result.return + 1.96 * result.volatility,
        prob_neg_1m: calcProbNeg(1),
        prob_neg_3m: calcProbNeg(3),
        prob_neg_1y: calcProbNeg(12),
        prob_neg_2y: calcProbNeg(24),
      },
    });
    } catch (err) {
      await reverseSpendOnError(spend, "min_variance_failed");
      throw err;
    }
  }
);

// POST /api/optimization/max-sharpe-tickers - Calculate maximum Sharpe ratio portfolio using tickers
optimization.post(
  "/max-sharpe-tickers",
  zValidator(
    "json",
    z.object({
      tickers: z.array(z.string()),
      w_max: z.number().min(0).max(1).default(1.0),
      w_min_per_asset: perAssetBoundSchema,
      w_max_per_asset: perAssetBoundSchema,
      risk_free_rate: z.number().min(0).default(0),
      start_date: z.string().optional(),
      end_date: z.string().optional(),
      enforce_full_investment: z.boolean().default(true),
      allow_short_selling: z.boolean().default(false),
      max_leverage: z.number().min(1).max(3).default(1.0),
    })
  ),
  async (c) => {
    // Validate the weight bounds before metering: an infeasible floor/cap
    // combination is a bad request, and the user should not be charged for it.
    const boundsError = validateAssetBounds(c.req.valid("json"));
    if (boundsError) {
      return c.json(boundsError, 400);
    }

    const user = c.get("user");
    const organizationId = c.get("organizationId");
    await assertTickersAllowed(organizationId, c.req.valid("json").tickers);
    const idempotencyKey = clientIdempotencyKey(c.req.header("Idempotency-Key"));
    const spend = await meterRequest({ organizationId, user, cost: 1, idempotencyKey });

    try {
    const {
      tickers,
      w_max,
      w_min_per_asset,
      w_max_per_asset,
      risk_free_rate,
      start_date,
      end_date,
      enforce_full_investment,
      allow_short_selling,
      max_leverage,
    } = c.req.valid("json");

    const { expectedReturns, volatilities, corrMatrix } = await getTickerAssumptions(tickers, start_date, end_date);
    const covMatrix = buildCovarianceMatrix(volatilities, corrMatrix);

    const result = findMaxSharpePortfolio(expectedReturns, covMatrix, {
      wMax: w_max,
      wMinPerAsset: w_min_per_asset,
      wMaxPerAsset: w_max_per_asset,
      riskFreeRate: risk_free_rate,
      numFrontierPoints: 50,
      enforceFullInvestment: enforce_full_investment,
      allowShortSelling: allow_short_selling,
      maxLeverage: max_leverage,
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

    // Calculate Sharpe ratio
    const sharpeRatio = result.volatility > 0 ? (result.return - risk_free_rate) / result.volatility : 0;

    return c.json({
      weights,
      expected_return: result.return,
      volatility: result.volatility,
      sharpe_ratio: sharpeRatio,
      stats: {
        ci_95_low: result.return - 1.96 * result.volatility,
        ci_95_high: result.return + 1.96 * result.volatility,
        prob_neg_1m: calcProbNeg(1),
        prob_neg_3m: calcProbNeg(3),
        prob_neg_1y: calcProbNeg(12),
        prob_neg_2y: calcProbNeg(24),
      },
    });
    } catch (err) {
      await reverseSpendOnError(spend, "max_sharpe_failed");
      throw err;
    }
  }
);

async function computeEfficientFrontier(request: FrontierRequest) {
  const { tickers, start_date, end_date, w_max, w_min_per_asset, w_max_per_asset, enforce_full_investment, allow_short_selling, max_leverage } = request;

  const { expectedReturns, volatilities, corrMatrix } = await getTickerAssumptions(tickers, start_date, end_date);
  const covMatrix = buildCovarianceMatrix(volatilities, corrMatrix);

  const frontier = calculateEfficientFrontier(expectedReturns, covMatrix, 25, w_max, {
    wMinPerAsset: w_min_per_asset,
    wMaxPerAsset: w_max_per_asset,
    enforceFullInvestment: enforce_full_investment,
    allowShortSelling: allow_short_selling,
    maxLeverage: max_leverage,
  });

  return {
    tickers,
    points: frontier.returns.map((ret, i) => ({
      ret: ret,
      vol: frontier.volatilities[i],
      weights: frontier.weights[i],
    })),
  };
}

// POST /api/optimization/efficient-frontier-tickers - Calculate efficient frontier using tickers
//
// Metered on every call: the tickers and dates are the caller's. The results
// page of a saved simulation uses `/simulations/:id/frontier` below instead.
optimization.post(
  "/efficient-frontier-tickers",
  zValidator("json", frontierRequestSchema),
  async (c) => {
    // Validate the weight bounds before metering: an infeasible floor/cap
    // combination is a bad request, and the user should not be charged for it.
    const boundsError = validateAssetBounds(c.req.valid("json"));
    if (boundsError) {
      return c.json(boundsError, 400);
    }

    const user = c.get("user");
    const organizationId = c.get("organizationId");
    await assertTickersAllowed(organizationId, c.req.valid("json").tickers);
    const idempotencyKey = clientIdempotencyKey(c.req.header("Idempotency-Key"));
    const spend = await meterRequest({ organizationId, user, cost: 1, idempotencyKey });

    try {
      return c.json(await computeEfficientFrontier(c.req.valid("json")));
    } catch (err) {
      await reverseSpendOnError(spend, "frontier_failed");
      throw err;
    }
  }
);

// POST /api/optimization/simulations/:id/frontier - The frontier of a saved simulation
//
// Takes no body: tickers, dates and constraints come from the stored row, which
// is read inside the caller's organization and read scope. The first frontier
// for a simulation and its current parameters costs 1 credit; opening it again
// replays that spend. See saved-frontier.ts for the rule and why it is safe.
optimization.post("/simulations/:id/frontier", async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");
  const organizationId = c.get("organizationId");

  const row = await db.query.simulations.findFirst({
    where: and(eq(simulations.id, id), readScope(organizationId, user.id)),
    columns: { id: true, params: true },
  });
  // The same answer for another tenant's id as for one that does not exist.
  if (!row) {
    return c.json({ error: "Simulation not found" }, 404);
  }

  let storedParams: unknown;
  try {
    storedParams = JSON.parse(row.params);
  } catch {
    storedParams = null;
  }
  const request = frontierRequestFromSimulationParams(storedParams);
  if (!request) {
    return c.json({ error: "simulation_has_no_frontier_parameters" }, 422);
  }

  // The same refusals as the metered route, before anything is charged.
  const boundsError = validateAssetBounds(request);
  if (boundsError) {
    return c.json(boundsError, 400);
  }
  await assertTickersAllowed(organizationId, request.tickers);

  const { spend, replayed } = await spendForSavedFrontier({
    organizationId,
    user,
    simulationId: row.id,
    request,
  });

  try {
    return c.json(await computeEfficientFrontier(request));
  } catch (err) {
    // Only the request that paid refunds. A replay refunding would return the
    // credit for the earlier view that succeeded.
    if (!replayed) await reverseSpendOnError(spend, "saved_frontier_failed");
    throw err;
  }
});

// POST /api/optimization/cumulative-returns-tickers - Calculate cumulative returns for tickers
optimization.post(
  "/cumulative-returns-tickers",
  zValidator(
    "json",
    z.object({
      tickers: z.array(z.string()),
      weights: z.array(z.number()),
      start_date: z.string().optional(),
    })
  ),
  async (c) => {
    const { tickers, weights } = c.req.valid("json");

    const { period1, period2 } = defaultLookbackPeriod();
    const pricesByTicker = await fetchTickerPrices(tickers, period1, period2);

    // Find common dates
    const allDates = new Set<string>();
    for (const prices of pricesByTicker.values()) {
      for (const p of prices) {
        allDates.add(p.date);
      }
    }
    const dates = Array.from(allDates).sort();

    // Calculate cumulative returns
    const tickerReturns: Map<string, number[]> = new Map();
    const portfolioReturns: number[] = [];

    // Get initial values
    const initialValues = new Map<string, number>();
    for (const [ticker, prices] of pricesByTicker) {
      if (prices.length > 0) {
        initialValues.set(ticker, prices[0].close);
      }
    }

    for (const date of dates) {
      let portfolioCumRet = 0;

      for (let i = 0; i < tickers.length; i++) {
        const ticker = tickers[i];
        const prices = pricesByTicker.get(ticker) ?? [];
        const priceOnDate = prices.find((p) => p.date === date);
        const firstPrice = initialValues.get(ticker) ?? 1;
        const currentPrice = priceOnDate?.close ?? firstPrice;

        const cumRet = currentPrice / firstPrice - 1;

        if (!tickerReturns.has(ticker)) {
          tickerReturns.set(ticker, []);
        }
        tickerReturns.get(ticker)!.push(cumRet);

        portfolioCumRet += weights[i] * cumRet;
      }

      portfolioReturns.push(portfolioCumRet);
    }

    const series = [
      ...tickers.map((ticker) => ({
        name: ticker,
        data: dates.map((date, i) => ({
          date,
          value: tickerReturns.get(ticker)?.[i] ?? 0,
        })),
      })),
      {
        name: "Portafolio Óptimo",
        data: dates.map((date, i) => ({
          date,
          value: portfolioReturns[i],
        })),
      },
    ];

    return c.json({ series });
  }
);

// POST /api/optimization/neg-return-prob - Calculate probability of negative return
optimization.post(
  "/neg-return-prob",
  zValidator(
    "json",
    z.object({
      r_ann: z.number(),
      vol_ann: z.number(),
      months: z.number().default(36),
    })
  ),
  async (c) => {
    const { r_ann, vol_ann, months } = c.req.valid("json");

    const probabilities: number[] = [];

    for (let m = 1; m <= months; m++) {
      const timeInYears = m / 12;
      const meanT = r_ann * timeInYears;
      const volT = vol_ann * Math.sqrt(timeInYears);
      const zScore = -meanT / volT;
      const prob = normalCDF(zScore);
      probabilities.push(prob);
    }

    return c.json({
      months: Array.from({ length: months }, (_, i) => i + 1),
      probabilities,
    });
  }
);

// POST /api/optimization/rolling-volatility-tickers - Calculate rolling volatility for tickers
optimization.post(
  "/rolling-volatility-tickers",
  zValidator(
    "json",
    z.object({
      tickers: z.array(z.string()),
      window: z.number().min(2).max(504).default(252),
      start_date: z.string().optional(),
      end_date: z.string().optional(),
    })
  ),
  async (c) => {
    const { tickers, window, start_date, end_date } = c.req.valid("json");

    const defaults = defaultLookbackPeriod();
    const pricesByTicker = await fetchTickerPrices(
      tickers,
      start_date || defaults.period1,
      end_date || defaults.period2
    );

    // Calculate rolling volatility for each ticker
    const series = tickers.map((ticker) => {
      const prices = pricesByTicker.get(ticker) ?? [];

      // Calculate daily log returns
      const returns: number[] = [];
      for (let i = 1; i < prices.length; i++) {
        returns.push(Math.log(prices[i].close / prices[i - 1].close));
      }

      // Calculate rolling standard deviation (annualized)
      const rollingVols = rollingStdDev(returns, window).map((vol) => vol * Math.sqrt(252));

      // Get dates starting from window position (since we need window returns for first calc)
      const dates = prices.slice(window).map((p) => p.date);

      return {
        name: ticker,
        data: dates.map((date, i) => ({
          date,
          volatility: rollingVols[i] ?? 0,
        })),
      };
    });

    return c.json({ series });
  }
);

optimization.route("/custom-benchmarks", customBenchmarkRoutes);

/** The user's own benchmarks, skipping any row whose stored legs are unusable. */
async function userBenchmarkDefinitions(userId: string): Promise<BenchmarkDefinition[]> {
  const rows = await db
    .select()
    .from(customBenchmarks)
    .where(eq(customBenchmarks.userId, userId));

  return rows.flatMap((row) => {
    const definition = customBenchmarkDefinition(row);
    return definition ? [definition] : [];
  });
}

// GET /api/optimization/benchmarks - Catalog of reference portfolios to compare against
optimization.get("/benchmarks", async (c) => {
  const user = c.get("user");
  const definitions = [...BENCHMARKS, ...(await userBenchmarkDefinitions(user.id))];

  return c.json({
    benchmarks: definitions.map((benchmark) => ({
      id: benchmark.id,
      category: benchmark.category,
      // Both are empty for the equal-weight benchmark, whose legs are the
      // simulation's own assets and so are only known once a comparison is
      // requested.
      tickers: benchmark.components.map((component) => component.ticker),
      // Full legs, so the editor can reopen a custom benchmark without a
      // second round trip for the same rows.
      components: benchmark.components,
      name: benchmark.name ?? null,
    })),
  });
});

/**
 * Ceiling on one comparison request. The web app caps the picker well below
 * this; the bound here just keeps a hand-rolled request from asking for a
 * hundred price series at once.
 */
const MAX_COMPARED_BENCHMARKS = 24;

// POST /api/optimization/benchmark-comparison - Measure a portfolio against selected benchmarks
optimization.post(
  "/benchmark-comparison",
  zValidator(
    "json",
    z.object({
      benchmarks: z.array(z.string()).max(MAX_COMPARED_BENCHMARKS),
      tickers: z.array(z.string()).min(1),
      weights: z.array(z.number()),
      start_date: z.string().optional(),
      end_date: z.string().optional(),
      risk_free_rate: z.number().min(0).default(0),
    })
  ),
  async (c) => {
    const { benchmarks, tickers, weights, start_date, end_date, risk_free_rate } =
      c.req.valid("json");

    if (weights.length !== tickers.length) {
      return c.json({ error: "weights must have one entry per ticker" }, 400);
    }

    const defaults = defaultLookbackPeriod();
    const period1 = start_date || defaults.period1;
    const period2 = end_date || defaults.period2;

    // Unknown ids are dropped rather than rejected: a saved simulation may
    // still name a benchmark that has since left the catalog, or a custom one
    // its author has since deleted.
    const user = c.get("user");
    const customById = benchmarks.some((id) => parseCustomBenchmarkId(id))
      ? new Map(
          (await userBenchmarkDefinitions(user.id)).map((definition) => [
            definition.id,
            definition,
          ])
        )
      : new Map<string, BenchmarkDefinition>();

    // Resolved up front so the legs used to price a benchmark are the same ones
    // reported back as its tickers.
    const resolved = benchmarks.flatMap((id) => {
      const definition = customById.get(id) ?? findBenchmark(id);
      if (!definition) return [];
      const components = resolveBenchmarkComponents(definition, tickers);
      if (components.length === 0) return [];
      return [{ ...definition, components }];
    });

    // The portfolio and every benchmark are priced over the same window and
    // through the same math, so the figures on both sides are comparable.
    const pricesByTicker = await fetchTickerPrices(
      [...new Set([...tickers, ...benchmarkTickers(resolved)])],
      period1,
      period2
    );

    const portfolio = buildWeightedSeries(
      tickers.map((ticker, i) => ({ ticker, weight: weights[i] ?? 0 })),
      pricesByTicker,
      risk_free_rate
    );

    const unavailable: string[] = [];
    const comparisons = resolved.flatMap((definition) => {
      const series = buildWeightedSeries(
        definition.components,
        pricesByTicker,
        risk_free_rate
      );
      // A benchmark Yahoo could not price at all is reported back by id, so the
      // client can say so instead of silently dropping the user's selection.
      if (!series) {
        unavailable.push(definition.id);
        return [];
      }
      return [
        {
          id: definition.id,
          category: definition.category,
          name: definition.name ?? null,
          tickers: definition.components.map((component) => component.ticker),
          expected_return: series.expectedReturn,
          volatility: series.volatility,
          sharpe_ratio: series.sharpeRatio,
          max_drawdown: series.maxDrawdown,
          total_return: series.totalReturn,
          series: series.points,
        },
      ];
    });

    return c.json({
      window: { start: period1, end: period2 },
      portfolio: portfolio
        ? {
            expected_return: portfolio.expectedReturn,
            volatility: portfolio.volatility,
            sharpe_ratio: portfolio.sharpeRatio,
            max_drawdown: portfolio.maxDrawdown,
            total_return: portfolio.totalReturn,
            series: portfolio.points,
          }
        : null,
      benchmarks: comparisons,
      unavailable,
    });
  }
);

// Helper function to get assumptions for tickers from Yahoo Finance
async function getTickerAssumptions(tickers: string[], startDate?: string, endDate?: string): Promise<{
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

export default optimization;
