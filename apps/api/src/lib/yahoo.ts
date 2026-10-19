import YahooFinance from "yahoo-finance2";
import { dateOnly } from "./dates.js";
import type { PricePoint } from "./market-data.js";

const yahooFinance = new YahooFinance();

/**
 * Daily closes from Yahoo's chart endpoint. `close` there is split-adjusted but
 * not dividend-adjusted. A ticker Yahoo cannot price comes back empty, not as
 * an error.
 */
export async function fetchYahooPrices(
  tickers: string[],
  period1: string,
  period2: string
): Promise<Map<string, PricePoint[]>> {
  const results = await Promise.all(
    tickers.map(async (ticker) => {
      try {
        const data = await yahooFinance.chart(ticker, {
          period1,
          period2,
          interval: "1d",
        });
        const points: PricePoint[] = (data.quotes ?? [])
          .filter((q) => q.close !== null)
          .map((q) => ({ date: dateOnly(q.date), close: q.close! }));
        return [ticker, points] as const;
      } catch (error) {
        console.error(`Error fetching ${ticker}:`, error);
        return [ticker, [] as PricePoint[]] as const;
      }
    })
  );

  return new Map(results);
}

/** Dividend- and split-adjusted daily closes for one ticker. Throws on failure. */
export async function fetchYahooAdjustedCloses(
  ticker: string,
  from: Date,
  to: Date
): Promise<PricePoint[]> {
  const historical = await yahooFinance.historical(ticker, { period1: from, period2: to });
  return historical.flatMap((quote) => {
    const close = quote.adjClose ?? quote.close;
    return close != null ? [{ date: dateOnly(quote.date), close }] : [];
  });
}
