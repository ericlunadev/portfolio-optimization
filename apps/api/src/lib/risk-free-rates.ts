import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

/**
 * Reference instruments offered as risk-free rate presets in the optimizer.
 *
 * Yahoo quotes each of these tickers as an annualised yield in percentage
 * points (4.25 means 4.25%), so a quote becomes the decimal the optimizer
 * expects by dividing by 100.
 *
 * Only the machine-readable identity lives here — display names are translated
 * on the client, keyed by `id`.
 */
export const RISK_FREE_INSTRUMENTS = [
  { id: "us-t-bill-3m", ticker: "^IRX" },
  { id: "us-treasury-5y", ticker: "^FVX" },
  { id: "us-treasury-10y", ticker: "^TNX" },
  { id: "us-treasury-30y", ticker: "^TYX" },
] as const;

export type RiskFreeInstrumentId = (typeof RISK_FREE_INSTRUMENTS)[number]["id"];

export interface RiskFreeRate {
  id: RiskFreeInstrumentId;
  ticker: string;
  /** Annualised yield as a decimal (0.0425 for 4.25%). */
  rate: number;
  /** ISO timestamp of the quote the rate was read from. */
  asOf: string;
}

const CACHE_TTL_MS = 60 * 60 * 1000;

let cache: { rates: RiskFreeRate[]; expiresAt: number } | null = null;

async function quoteInstrument(
  instrument: (typeof RISK_FREE_INSTRUMENTS)[number]
): Promise<RiskFreeRate | null> {
  try {
    const quote = await yahooFinance.quote(instrument.ticker, {}, { validateResult: false });
    const yieldPercent = quote?.regularMarketPrice;

    if (typeof yieldPercent !== "number" || !Number.isFinite(yieldPercent) || yieldPercent < 0) {
      return null;
    }

    const quotedAt = quote.regularMarketTime;

    return {
      id: instrument.id,
      ticker: instrument.ticker,
      // Yahoo's quotes carry float noise (4.7580004 for a 4.758% yield), which
      // would otherwise reach the share URL and the saved simulation verbatim.
      // A ten-thousandth of a percentage point is far finer than a basis point.
      rate: Math.round(yieldPercent * 1e4) / 1e6,
      asOf: (quotedAt instanceof Date ? quotedAt : new Date()).toISOString(),
    };
  } catch (error) {
    console.error(`Error fetching risk-free rate for ${instrument.ticker}:`, error);
    return null;
  }
}

/**
 * Current yields for the reference instruments, cached in memory for an hour.
 *
 * Instruments that fail to quote are dropped rather than failing the whole
 * request, and an empty result is never cached so a transient Yahoo outage
 * doesn't blank the picker for the rest of the hour.
 */
export async function fetchRiskFreeRates(): Promise<RiskFreeRate[]> {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.rates;
  }

  const quoted = await Promise.all(RISK_FREE_INSTRUMENTS.map(quoteInstrument));
  const rates = quoted.filter((rate): rate is RiskFreeRate => rate !== null);

  if (rates.length > 0) {
    cache = { rates, expiresAt: Date.now() + CACHE_TTL_MS };
  }

  return rates;
}
