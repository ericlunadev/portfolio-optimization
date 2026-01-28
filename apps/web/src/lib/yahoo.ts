import YahooFinance from "yahoo-finance2";
import { mean, stdDev, correlationMatrix } from "./math/stats";

const yahooFinance = new YahooFinance();

export interface TickerAssumptions {
  expectedReturns: number[];
  volatilities: number[];
  corrMatrix: number[][];
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

  // Fetch monthly data for each ticker
  for (const ticker of tickers) {
    try {
      const data = (await yahooFinance.chart(ticker, {
        period1,
        period2,
        interval: "1mo",
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

  // Calculate monthly returns for each ticker
  const monthlyReturnsByTicker: number[][] = [];

  for (const ticker of tickers) {
    const prices = pricesByTicker.get(ticker) ?? [];
    const returns: number[] = [];

    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i].close - prices[i - 1].close) / prices[i - 1].close);
    }

    monthlyReturnsByTicker.push(returns);
  }

  // Find minimum common length and trim
  let minLen = Infinity;
  for (const returns of monthlyReturnsByTicker) {
    minLen = Math.min(minLen, returns.length);
  }

  const trimmedReturns = monthlyReturnsByTicker.map((returns) => returns.slice(-minLen));

  // Calculate expected returns and volatilities (annualized from monthly)
  const expectedReturns: number[] = [];
  const volatilities: number[] = [];

  for (const returns of trimmedReturns) {
    const avgMonthlyReturn = returns.length > 0 ? mean(returns) : 0;
    const monthlyVol = returns.length > 0 ? stdDev(returns) : 0.05;

    expectedReturns.push(avgMonthlyReturn * 12);
    volatilities.push(monthlyVol * Math.sqrt(12));
  }

  // Calculate correlation matrix
  const corrMatrix = correlationMatrix(trimmedReturns);

  return { expectedReturns, volatilities, corrMatrix };
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
        interval: "1mo",
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
