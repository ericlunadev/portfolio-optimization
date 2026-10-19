import { env } from "../config/env.js";
import { dateOnly } from "./dates.js";
import { fetchEodhdAdjustedCloses, fetchEodhdPrices } from "./eodhd.js";
import { fetchYahooAdjustedCloses, fetchYahooPrices } from "./yahoo.js";

/**
 * The one door to historical prices. Which provider stands behind it is a
 * deployment setting (`MARKET_DATA_PROVIDER`), not something a caller chooses:
 * every figure in one deployment has to come from the same source to be
 * comparable. Symbols are always Yahoo-style; the EODHD client translates.
 *
 * Ticker search (`modules/historical`) and the risk-free presets
 * (`lib/risk-free-rates.ts`) still read Yahoo directly whichever is set.
 */

export type PricePoint = { date: string; close: number };

/**
 * Daily closes per ticker over `[period1, period2]` (YYYY-MM-DD). A ticker the
 * provider cannot price maps to an empty array; a throw means the provider
 * itself is unavailable.
 */
export function fetchTickerPrices(
  tickers: string[],
  period1: string,
  period2: string
): Promise<Map<string, PricePoint[]>> {
  if (env.MARKET_DATA_PROVIDER === "eodhd") {
    return fetchEodhdPrices(tickers, period1, period2, env.EODHD_API_TOKEN!);
  }
  return fetchYahooPrices(tickers, period1, period2);
}

/**
 * Dividend- and split-adjusted daily closes for one ticker, for storing in the
 * `prices` table. Throws when the ticker cannot be priced.
 */
export function fetchAdjustedCloses(ticker: string, from: Date, to: Date): Promise<PricePoint[]> {
  if (env.MARKET_DATA_PROVIDER === "eodhd") {
    return fetchEodhdAdjustedCloses(ticker, dateOnly(from), dateOnly(to), env.EODHD_API_TOKEN!);
  }
  return fetchYahooAdjustedCloses(ticker, from, to);
}
