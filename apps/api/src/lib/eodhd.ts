import type { PricePoint } from "./market-data.js";

/**
 * EOD Historical Data (eodhd.com) — the alternative to Yahoo for daily prices.
 * https://eodhd.com/financial-apis/api-for-historical-data-and-volumes
 *
 * Every symbol the app stores (saved simulations, benchmarks, fund allowlists,
 * `funds.yahoo_ticker`) is written the way Yahoo spells it, and ticker search
 * still runs through Yahoo. So symbols are translated here, at the edge, and the
 * result map is keyed by the caller's original symbol. Nothing upstream needs
 * to know which provider priced it.
 */

const BASE_URL = "https://eodhd.com/api/eod";
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Yahoo exchange suffix → EODHD exchange code. A suffix not listed here is
 * passed through as-is, which is right for the many venues where the two
 * providers agree (PA, AS, MC, SW, TO, HK, ...); those are listed anyway so the
 * table doubles as the reference for what has been checked.
 */
const EXCHANGE_BY_YAHOO_SUFFIX: Record<string, string> = {
  // Europe
  L: "LSE",
  IL: "IL",
  DE: "XETRA",
  F: "F",
  BE: "BE",
  DU: "DU",
  HM: "HM",
  HA: "HA",
  MU: "MU",
  SG: "STU",
  PA: "PA",
  AS: "AS",
  BR: "BR",
  LS: "LS",
  MC: "MC",
  MI: "MI",
  SW: "SW",
  VI: "VI",
  ST: "ST",
  OL: "OL",
  CO: "CO",
  HE: "HE",
  IR: "IR",
  WA: "WAR",
  PR: "PR",
  BD: "BUD",
  AT: "AT",
  IS: "IS",
  // Americas
  TO: "TO",
  V: "V",
  NE: "NEO",
  MX: "MX",
  SA: "SA",
  BA: "BA",
  SN: "SN",
  // Asia-Pacific and others
  T: "TSE",
  HK: "HK",
  SS: "SHG",
  SZ: "SHE",
  KS: "KO",
  KQ: "KQ",
  TW: "TW",
  TWO: "TWO",
  AX: "AU",
  NS: "NSE",
  BO: "BSE",
  JK: "JK",
  BK: "BK",
  KL: "KLSE",
  JO: "JSE",
  TA: "TA",
  SR: "SR",
};

// `BTC-USD`, `ETH-EUR`. A share class like `BRK-B` never ends in a currency.
const CRYPTO_RE = /^[A-Z0-9]+-(USD|USDT|USDC|EUR|GBP|BTC|ETH)$/;

/**
 * The EODHD symbol for a Yahoo symbol, or `null` for one EODHD's EOD endpoint
 * has no equivalent for (Yahoo futures, `GC=F`).
 */
export function toEodhdSymbol(yahooSymbol: string): string | null {
  const symbol = yahooSymbol.trim().toUpperCase();
  if (!symbol) return null;

  // ^GSPC → GSPC.INDX
  if (symbol.startsWith("^")) return `${symbol.slice(1)}.INDX`;

  if (symbol.endsWith("=X")) {
    const pair = symbol.slice(0, -2);
    // Yahoo writes a USD base implicitly: `MXN=X` is USD/MXN.
    return `${pair.length === 3 ? `USD${pair}` : pair}.FOREX`;
  }

  if (symbol.endsWith("=F")) return null;

  if (CRYPTO_RE.test(symbol)) return `${symbol}.CC`;

  const dot = symbol.lastIndexOf(".");
  if (dot > 0) {
    const suffix = symbol.slice(dot + 1);
    const code = symbol.slice(0, dot);
    return `${code}.${EXCHANGE_BY_YAHOO_SUFFIX[suffix] ?? suffix}`;
  }

  // No suffix means a US listing on Yahoo.
  return `${symbol}.US`;
}

/** One bar of `GET /api/eod/{symbol}?fmt=json`. Only the fields read here. */
interface EodhdBar {
  date: string;
  close: number | null;
  adjusted_close: number | null;
}

/**
 * The provider itself is unusable — bad token, out of quota, or down — as
 * opposed to one symbol being unknown. Callers treat a throw from
 * `fetchTickerPrices` as an outage, so this one is never swallowed.
 */
export class EodhdUnavailableError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "EodhdUnavailableError";
  }
}

/**
 * Daily closes for one symbol, oldest first. Uses `adjusted_close` (splits and
 * dividends): EODHD's `close` is raw, not even split-adjusted, so a split would
 * read as a one-day crash. Yahoo's chart closes are split- but not
 * dividend-adjusted, so the two providers' returns differ by the dividend yield.
 *
 * An unknown or unentitled symbol (404/403) is an empty series, the same thing
 * Yahoo gives for it.
 */
async function fetchEodhdSeries(
  eodhdSymbol: string,
  from: string,
  to: string,
  apiToken: string
): Promise<PricePoint[]> {
  const url = new URL(`${BASE_URL}/${encodeURIComponent(eodhdSymbol)}`);
  url.searchParams.set("api_token", apiToken);
  url.searchParams.set("fmt", "json");
  url.searchParams.set("period", "d");
  url.searchParams.set("order", "a");
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    throw new EodhdUnavailableError(0, `EODHD request failed: ${String(error)}`);
  }

  if (response.status === 404 || response.status === 403) {
    console.error(`EODHD has no data for ${eodhdSymbol} (HTTP ${response.status})`);
    return [];
  }
  if (!response.ok) {
    // 401 bad token, 402 quota spent, 429 rate limited, 5xx.
    throw new EodhdUnavailableError(
      response.status,
      `EODHD returned HTTP ${response.status} for ${eodhdSymbol}`
    );
  }

  const bars = (await response.json()) as EodhdBar[];
  if (!Array.isArray(bars)) return [];

  return bars.flatMap((bar) => {
    const close = bar.adjusted_close ?? bar.close;
    return typeof close === "number" && Number.isFinite(close) && close > 0
      ? [{ date: bar.date, close }]
      : [];
  });
}

export async function fetchEodhdPrices(
  tickers: string[],
  period1: string,
  period2: string,
  apiToken: string
): Promise<Map<string, PricePoint[]>> {
  const results = await Promise.all(
    tickers.map(async (ticker) => {
      const symbol = toEodhdSymbol(ticker);
      if (!symbol) {
        console.error(`EODHD cannot price ${ticker}: no equivalent symbol`);
        return [ticker, [] as PricePoint[]] as const;
      }
      return [ticker, await fetchEodhdSeries(symbol, period1, period2, apiToken)] as const;
    })
  );

  return new Map(results);
}

/** Adjusted daily closes for one ticker. Throws when it cannot be priced. */
export async function fetchEodhdAdjustedCloses(
  ticker: string,
  from: string,
  to: string,
  apiToken: string
): Promise<PricePoint[]> {
  const symbol = toEodhdSymbol(ticker);
  if (!symbol) throw new Error(`No EODHD equivalent for ${ticker}`);
  return fetchEodhdSeries(symbol, from, to, apiToken);
}
