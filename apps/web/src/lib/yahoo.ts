import YahooFinance from "yahoo-finance2";
import { mean, stdDev, correlationMatrix } from "./math/stats";

const yahooFinance = new YahooFinance();

export interface TickerAssumptions {
  expectedReturns: number[];
  volatilities: number[];
  corrMatrix: number[][];
}

export interface CalculationSteps {
  // Step 1: Daily returns for each ticker
  dailyReturns: { ticker: string; returns: number[] }[];
  // Step 2: Statistics per ticker
  tickerStats: {
    ticker: string;
    meanDailyReturn: number;
    dailyVolatility: number;
    annualizedReturn: number;
    annualizedVolatility: number;
  }[];
  // Step 3: Pairwise correlations
  pairwiseCorrelations: {
    ticker1: string;
    ticker2: string;
    correlation: number;
  }[];
}

export interface TickerAssumptionsWithSteps extends TickerAssumptions {
  steps: CalculationSteps;
}

interface ChartQuote {
  date: Date;
  close: number | null;
}

interface ChartResult {
  quotes: ChartQuote[];
}

/**
 * Get assumptions for tickers from Yahoo Finance
 */
export async function getTickerAssumptions(
  tickers: string[],
  startDate?: string,
  endDate?: string
): Promise<TickerAssumptions> {
  const pricesByTicker = new Map<string, { date: string; close: number }[]>();

  const period1 = startDate || new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const period2 = endDate || new Date().toISOString().split("T")[0];

  // Fetch daily data for each ticker
  for (const ticker of tickers) {
    try {
      const data = (await yahooFinance.chart(ticker, {
        period1,
        period2,
        interval: "1d",
      })) as unknown as ChartResult;

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

/**
 * Get assumptions for tickers with detailed calculation steps
 */
export async function getTickerAssumptionsWithSteps(
  tickers: string[],
  startDate?: string,
  endDate?: string
): Promise<TickerAssumptionsWithSteps> {
  const pricesByTicker = new Map<string, { date: string; close: number }[]>();

  const period1 = startDate || new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const period2 = endDate || new Date().toISOString().split("T")[0];

  for (const ticker of tickers) {
    try {
      const data = (await yahooFinance.chart(ticker, {
        period1,
        period2,
        interval: "1d",
      })) as unknown as ChartResult;

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

  // Step 1: Calculate daily log returns
  const dailyReturnsByTicker: number[][] = [];
  const dailyReturnsWithTicker: { ticker: string; returns: number[] }[] = [];

  for (const ticker of tickers) {
    const prices = pricesByTicker.get(ticker) ?? [];
    const returns: number[] = [];

    for (let i = 1; i < prices.length; i++) {
      returns.push(Math.log(prices[i].close / prices[i - 1].close));
    }

    dailyReturnsByTicker.push(returns);
    dailyReturnsWithTicker.push({ ticker, returns });
  }

  // Trim to common length
  let minLen = Infinity;
  for (const returns of dailyReturnsByTicker) {
    minLen = Math.min(minLen, returns.length);
  }

  const trimmedReturns = dailyReturnsByTicker.map((returns) => returns.slice(-minLen));
  const trimmedReturnsWithTicker = dailyReturnsWithTicker.map((item, i) => ({
    ticker: item.ticker,
    returns: trimmedReturns[i],
  }));

  // Step 2: Calculate statistics per ticker
  const expectedReturns: number[] = [];
  const volatilities: number[] = [];
  const tickerStats: CalculationSteps["tickerStats"] = [];

  for (let i = 0; i < trimmedReturns.length; i++) {
    const returns = trimmedReturns[i];
    const avgDailyReturn = returns.length > 0 ? mean(returns) : 0;
    const dailyVol = returns.length > 0 ? stdDev(returns) : 0.05;
    const annualizedReturn = avgDailyReturn * 252;
    const annualizedVol = dailyVol * Math.sqrt(252);

    expectedReturns.push(annualizedReturn);
    volatilities.push(annualizedVol);

    tickerStats.push({
      ticker: tickers[i],
      meanDailyReturn: avgDailyReturn,
      dailyVolatility: dailyVol,
      annualizedReturn,
      annualizedVolatility: annualizedVol,
    });
  }

  // Step 3: Calculate correlation matrix and pairwise correlations
  const corrMatrix = correlationMatrix(trimmedReturns);
  const pairwiseCorrelations: CalculationSteps["pairwiseCorrelations"] = [];

  for (let i = 0; i < tickers.length; i++) {
    for (let j = i + 1; j < tickers.length; j++) {
      pairwiseCorrelations.push({
        ticker1: tickers[i],
        ticker2: tickers[j],
        correlation: corrMatrix[i][j],
      });
    }
  }

  return {
    expectedReturns,
    volatilities,
    corrMatrix,
    steps: {
      dailyReturns: trimmedReturnsWithTicker,
      tickerStats,
      pairwiseCorrelations,
    },
  };
}

/**
 * Fetch historical prices for tickers
 */
export async function getHistoricalPrices(
  tickers: string[],
  startDate?: string,
  endDate?: string
): Promise<Map<string, { date: string; close: number }[]>> {
  const pricesByTicker = new Map<string, { date: string; close: number }[]>();

  for (const ticker of tickers) {
    try {
      const data = (await yahooFinance.chart(ticker, {
        period1: startDate || new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        period2: endDate || new Date().toISOString().split("T")[0],
        interval: "1d",
      })) as unknown as ChartResult;

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

  return pricesByTicker;
}
