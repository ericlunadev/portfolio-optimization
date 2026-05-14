import YahooFinance from "yahoo-finance2";
import { dateOnly } from "./dates.js";

const yahooFinance = new YahooFinance();

export type PricePoint = { date: string; close: number };

export async function fetchTickerPrices(
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
