import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

/**
 * Currency a rate is denominated in.
 *
 * A risk-free rate is only meaningful against a portfolio priced in the same
 * currency — a 20% peso rate against dollar-priced assets would swamp every
 * Sharpe ratio — so the picker groups the instruments by this.
 */
export type RiskFreeCurrency = "USD" | "ARS";

/**
 * Reference instruments offered as risk-free rate presets in the optimizer.
 *
 * Only the machine-readable identity lives here — display names are translated
 * on the client, keyed by `id`. The order is the order the picker lists them in.
 */
export const RISK_FREE_INSTRUMENTS = [
  { id: "us-t-bill-3m", currency: "USD" },
  { id: "us-treasury-2y", currency: "USD" },
  { id: "us-treasury-5y", currency: "USD" },
  { id: "us-treasury-10y", currency: "USD" },
  { id: "us-treasury-30y", currency: "USD" },
  { id: "ar-caucion-usd", currency: "USD" },
  { id: "ar-plazo-fijo-30d", currency: "ARS" },
  { id: "ar-caucion-ars", currency: "ARS" },
] as const;

export type RiskFreeInstrumentId = (typeof RISK_FREE_INSTRUMENTS)[number]["id"];

export interface RiskFreeRate {
  id: RiskFreeInstrumentId;
  currency: RiskFreeCurrency;
  /**
   * Where the rate was read from, shown verbatim beside the picker so the
   * number is traceable: a Yahoo ticker, or a "provider · series" label.
   */
  source: string;
  /** Annualised yield as a decimal (0.0425 for 4.25%). */
  rate: number;
  /** ISO timestamp of the quote the rate was read from. */
  asOf: string;
}

const CACHE_TTL_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

let cache: { rates: RiskFreeRate[]; expiresAt: number } | null = null;

/**
 * Percentage-point yields carry float noise (4.7580004 for a 4.758% yield),
 * which would otherwise reach the share URL and the saved simulation verbatim.
 * Six decimals on the fraction is a ten-thousandth of a percentage point — far
 * finer than a basis point.
 */
function rateFromPercent(percent: number): number {
  return Math.round(percent * 1e4) / 1e6;
}

function roundRate(rate: number): number {
  return Math.round(rate * 1e6) / 1e6;
}

function isUsableRate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** A plain-date series (BCRA, FRED) is dated, not timestamped; anchor it at UTC noon. */
function isoFromDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toISOString();
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`${url} responded ${response.status}`);
  }
  return response.json();
}

// ---------------------------------------------------------------------------
// Yahoo Finance — US treasury yield indices
// ---------------------------------------------------------------------------

const YAHOO_TICKERS: Partial<Record<RiskFreeInstrumentId, string>> = {
  "us-t-bill-3m": "^IRX",
  "us-treasury-5y": "^FVX",
  "us-treasury-10y": "^TNX",
  "us-treasury-30y": "^TYX",
};

/** Yahoo quotes these as annualised yields in percentage points (4.25 means 4.25%). */
async function fetchYahooRates(): Promise<RiskFreeRate[]> {
  const quoted = await Promise.all(
    Object.entries(YAHOO_TICKERS).map(async ([id, ticker]): Promise<RiskFreeRate | null> => {
      try {
        const quote = await yahooFinance.quote(ticker, {}, { validateResult: false });
        const yieldPercent = quote?.regularMarketPrice;

        if (!isUsableRate(yieldPercent)) return null;

        const quotedAt = quote.regularMarketTime;

        return {
          id: id as RiskFreeInstrumentId,
          currency: "USD",
          source: ticker,
          rate: rateFromPercent(yieldPercent),
          asOf: (quotedAt instanceof Date ? quotedAt : new Date()).toISOString(),
        };
      } catch (error) {
        console.error(`Error fetching risk-free rate for ${ticker}:`, error);
        return null;
      }
    })
  );

  return quoted.filter((rate): rate is RiskFreeRate => rate !== null);
}

// ---------------------------------------------------------------------------
// FRED — 2-year US treasury constant maturity (DGS2)
// ---------------------------------------------------------------------------

/**
 * Yahoo publishes no index for the 2-year point, so it comes from FRED's public
 * CSV instead. `cosd` bounds the download to the recent window — the full series
 * runs back to 1976 and is ~200KB. Non-trading days are published as ".".
 */
async function fetchTreasury2y(): Promise<RiskFreeRate[]> {
  const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  try {
    const response = await fetch(
      `https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS2&cosd=${start}`,
      { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }
    );
    if (!response.ok) throw new Error(`FRED responded ${response.status}`);

    const rows = (await response.text())
      .trim()
      .split("\n")
      .slice(1)
      .map((line) => line.split(","));

    for (let i = rows.length - 1; i >= 0; i--) {
      const [date, value] = rows[i];
      const percent = Number(value);
      if (!date || !value || value === "." || !isUsableRate(percent)) continue;

      return [
        {
          id: "us-treasury-2y",
          currency: "USD",
          source: "FRED · DGS2",
          rate: rateFromPercent(percent),
          asOf: isoFromDate(date),
        },
      ];
    }

    return [];
  } catch (error) {
    console.error("Error fetching risk-free rate for FRED DGS2:", error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// BCRA — 30-day time deposit rate (plazo fijo)
// ---------------------------------------------------------------------------

interface BcraResponse {
  results?: { detalle?: { fecha?: string; valor?: number }[] }[];
}

/**
 * BCRA variable 12, "tasa de interés de depósitos a 30 días": the published
 * benchmark for a peso time deposit, in percentage points. The series is
 * newest-first, so `limit=1` is the latest reading.
 */
async function fetchPlazoFijo(): Promise<RiskFreeRate[]> {
  try {
    const body = (await fetchJson(
      "https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/12?limit=1"
    )) as BcraResponse;

    const latest = body.results?.[0]?.detalle?.[0];
    if (!latest?.fecha || !isUsableRate(latest.valor)) return [];

    return [
      {
        id: "ar-plazo-fijo-30d",
        currency: "ARS",
        source: "BCRA · Depósitos 30 días",
        rate: rateFromPercent(latest.valor),
        asOf: isoFromDate(latest.fecha),
      },
    ];
  } catch (error) {
    console.error("Error fetching risk-free rate for BCRA plazo fijo:", error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// BYMA — overnight repo (caución) in pesos and dollars
// ---------------------------------------------------------------------------

interface BymaCaucion {
  denominationCcy?: string;
  daysToMaturity?: number;
  vwap?: number;
  previousClosingPrice?: number;
}

/**
 * Upper bound on a plausible annualised rate, as a decimal.
 *
 * 1000% is far above anything Argentine money markets have printed, so nothing
 * real trips it — but a feed that started publishing percentage points where it
 * used to publish decimals would, which is the mistake worth catching. BYMA
 * already does exactly that on `settlementPrice`, which is why we read `vwap`.
 */
const MAX_PLAUSIBLE_RATE = 10;

const CAUCION_BOARDS = [
  { id: "ar-caucion-ars", currency: "ARS", ccy: "ARS", label: "Caución en pesos" },
  { id: "ar-caucion-usd", currency: "USD", ccy: "USD", label: "Caución en dólares" },
] as const;

/**
 * BYMA's open feed quotes every caución tenor as an annualised rate expressed
 * as a decimal (0.19 for 19%). The shortest tenor on the board is the reference
 * rate people quote, so that is the one we take.
 *
 * We read `vwap`, the day's volume-weighted average — the same construction as
 * BYMA's own caución index, and steadier than the last print. It is zero until
 * the tenor trades, so outside the session (and on tenors that never traded) we
 * fall back to the previous close. Both sit at zero on a tenor with no history
 * at all, which a plain finite check would accept — hence the `> 0` filter.
 *
 * Note `settlementPrice` is deliberately unused: alone among the price fields
 * it is published in percentage points (20.1 for 20.1%), so reading it
 * alongside the others silently inflates the rate a hundredfold.
 */
async function fetchCauciones(): Promise<RiskFreeRate[]> {
  try {
    const board = (await fetchJson(
      "https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/cauciones",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          "Content-Type": "application/json",
          excludeZeroPxAndQty: false,
          T0: true,
          T1: true,
          T2: true,
        }),
      }
    )) as BymaCaucion[];

    if (!Array.isArray(board)) return [];

    const asOf = new Date().toISOString();

    return CAUCION_BOARDS.flatMap<RiskFreeRate>(({ id, currency, ccy, label }) => {
      const shortest = board
        .filter((row) => row.denominationCcy === ccy)
        .map((row) => ({
          days: row.daysToMaturity ?? Number.POSITIVE_INFINITY,
          rate: (row.vwap ?? 0) > 0 ? row.vwap : row.previousClosingPrice,
        }))
        .filter(
          (row): row is { days: number; rate: number } =>
            isUsableRate(row.rate) &&
            row.rate > 0 &&
            row.rate < MAX_PLAUSIBLE_RATE &&
            Number.isFinite(row.days)
        )
        .sort((a, b) => a.days - b.days)[0];

      if (!shortest) return [];

      return [
        {
          id,
          currency,
          source: `BYMA · ${label} ${shortest.days}d`,
          rate: roundRate(shortest.rate),
          asOf,
        },
      ];
    });
  } catch (error) {
    console.error("Error fetching risk-free rates for BYMA cauciones:", error);
    return [];
  }
}

// ---------------------------------------------------------------------------

const PROVIDERS = [fetchYahooRates, fetchTreasury2y, fetchPlazoFijo, fetchCauciones];

const INSTRUMENT_ORDER = new Map(RISK_FREE_INSTRUMENTS.map((i, index) => [i.id, index]));

/**
 * Current yields for the reference instruments, cached in memory for an hour.
 *
 * Each provider is independent: one that fails contributes nothing rather than
 * failing the whole request, and an empty result is never cached so a transient
 * outage doesn't blank the picker for the rest of the hour.
 */
export async function fetchRiskFreeRates(): Promise<RiskFreeRate[]> {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.rates;
  }

  const fetched = await Promise.all(PROVIDERS.map((provider) => provider()));
  const rates = fetched
    .flat()
    .sort((a, b) => (INSTRUMENT_ORDER.get(a.id) ?? 0) - (INSTRUMENT_ORDER.get(b.id) ?? 0));

  if (rates.length > 0) {
    cache = { rates, expiresAt: Date.now() + CACHE_TTL_MS };
  }

  return rates;
}
