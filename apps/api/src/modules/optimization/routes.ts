import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import YahooFinance from "yahoo-finance2";
import { findMinVariancePortfolio, calculateEfficientFrontier, findMaxSharpePortfolio } from "../../lib/math/optimizer.js";
import { buildCovarianceMatrix } from "../../lib/math/matrix.js";
import { correlationMatrix, normalCDF, stdDev, mean, rollingStdDev } from "../../lib/math/stats.js";

const yahooFinance = new YahooFinance();

const optimization = new Hono();

// POST /api/optimization/min-variance-tickers - Calculate minimum variance portfolio using tickers
optimization.post(
  "/min-variance-tickers",
  zValidator(
    "json",
    z.object({
      tickers: z.array(z.string()),
      r_min: z.number().min(0).max(1),
      w_max: z.number().min(0).max(1).default(1.0),
      start_date: z.string().optional(),
      end_date: z.string().optional(),
      // Constraint toggles
      enforce_full_investment: z.boolean().default(true),
      allow_short_selling: z.boolean().default(false),
      vol_max: z.number().min(0).max(1).optional(),
      max_leverage: z.number().min(1).max(3).default(1.0),
    })
  ),
  async (c) => {
    const {
      tickers,
      r_min,
      w_max,
      start_date,
      end_date,
      enforce_full_investment,
      allow_short_selling,
      vol_max,
      max_leverage,
    } = c.req.valid("json");

    const { expectedReturns, volatilities, corrMatrix } = await getTickerAssumptions(tickers, start_date, end_date);
    const covMatrix = buildCovarianceMatrix(volatilities, corrMatrix);

    const result = findMinVariancePortfolio(expectedReturns, covMatrix, {
      rMin: r_min,
      wMax: w_max,
      enforceFullInvestment: enforce_full_investment,
      allowShortSelling: allow_short_selling,
      volMax: vol_max,
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
      risk_free_rate: z.number().min(0).max(0.2).default(0),
      start_date: z.string().optional(),
      end_date: z.string().optional(),
      enforce_full_investment: z.boolean().default(true),
      allow_short_selling: z.boolean().default(false),
      max_leverage: z.number().min(1).max(3).default(1.0),
    })
  ),
  async (c) => {
    const {
      tickers,
      w_max,
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
  }
);

// POST /api/optimization/efficient-frontier-tickers - Calculate efficient frontier using tickers
optimization.post(
  "/efficient-frontier-tickers",
  zValidator(
    "json",
    z.object({
      tickers: z.array(z.string()),
      start_date: z.string().optional(),
      end_date: z.string().optional(),
      // Constraint toggles (for consistent frontier calculation)
      enforce_full_investment: z.boolean().default(true),
      allow_short_selling: z.boolean().default(false),
      max_leverage: z.number().min(1).max(3).default(1.0),
    })
  ),
  async (c) => {
    const { tickers, start_date, end_date, enforce_full_investment, allow_short_selling, max_leverage } = c.req.valid("json");

    const { expectedReturns, volatilities, corrMatrix } = await getTickerAssumptions(tickers, start_date, end_date);
    const covMatrix = buildCovarianceMatrix(volatilities, corrMatrix);

    const frontier = calculateEfficientFrontier(expectedReturns, covMatrix, 9, 1.0, {
      enforceFullInvestment: enforce_full_investment,
      allowShortSelling: allow_short_selling,
      maxLeverage: max_leverage,
    });

    return c.json({
      points: frontier.returns.map((ret, i) => ({
        ret: ret,
        vol: frontier.volatilities[i],
      })),
    });
  }
);

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

    // Fetch historical data from Yahoo Finance
    const pricesByTicker = new Map<string, { date: string; close: number }[]>();

    for (const ticker of tickers) {
      try {
        const data = await yahooFinance.chart(ticker, {
          period1: new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          period2: new Date().toISOString().split("T")[0],
          interval: "1d",
        });

        if (data.quotes) {
          pricesByTicker.set(
            ticker,
            data.quotes
              .filter((q) => q.close !== null)
              .map((q) => ({
                date: new Date(q.date).toISOString().split("T")[0],
                close: q.close!,
              }))
          );
        }
      } catch (error) {
        console.error(`Error fetching ${ticker}:`, error);
      }
    }

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

    const pricesByTicker = new Map<string, { date: string; close: number }[]>();

    const period1 = start_date || new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const period2 = end_date || new Date().toISOString().split("T")[0];

    // Fetch daily data for each ticker
    for (const ticker of tickers) {
      try {
        const data = await yahooFinance.chart(ticker, {
          period1,
          period2,
          interval: "1d",
        });

        if (data.quotes) {
          pricesByTicker.set(
            ticker,
            data.quotes
              .filter((q) => q.close !== null)
              .map((q) => ({
                date: new Date(q.date).toISOString().split("T")[0],
                close: q.close!,
              }))
          );
        }
      } catch (error) {
        console.error(`Error fetching ${ticker}:`, error);
      }
    }

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

// Helper function to get assumptions for tickers from Yahoo Finance
async function getTickerAssumptions(tickers: string[], startDate?: string, endDate?: string): Promise<{
  expectedReturns: number[];
  volatilities: number[];
  corrMatrix: number[][];
}> {
  const pricesByTicker = new Map<string, { date: string; close: number }[]>();

  const period1 = startDate || new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const period2 = endDate || new Date().toISOString().split("T")[0];

  // Fetch daily data for each ticker within the specified date range
  for (const ticker of tickers) {
    try {
      const data = await yahooFinance.chart(ticker, {
        period1,
        period2,
        interval: "1d",
      });

      if (data.quotes) {
        pricesByTicker.set(
          ticker,
          data.quotes
            .filter((q) => q.close !== null)
            .map((q) => ({
              date: new Date(q.date).toISOString().split("T")[0],
              close: q.close!,
            }))
        );
      }
    } catch (error) {
      console.error(`Error fetching ${ticker}:`, error);
    }
  }

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

  return { expectedReturns, volatilities, corrMatrix };
}

export default optimization;
