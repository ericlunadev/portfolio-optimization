import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const quote = vi.fn();

vi.mock("yahoo-finance2", () => ({
  default: class {
    quote = quote;
  },
}));

const { fetchRiskFreeRates, RISK_FREE_INSTRUMENTS } = await import("./risk-free-rates.js");

const QUOTED_AT = new Date("2026-08-31T18:07:12.000Z");

function quoteYield(yieldPercent: number | null) {
  return { regularMarketPrice: yieldPercent, regularMarketTime: QUOTED_AT };
}

const FRED_CSV = ["observation_date,DGS2", "2026-09-02,4.39", "2026-09-03,.", "2026-09-04,4.37"].join(
  "\n"
);

const BCRA_BODY = {
  status: 200,
  results: [{ idVariable: 12, detalle: [{ fecha: "2026-09-07", valor: 21.05 }] }],
};

// Shaped after a live session: `settlementPrice` is published in percentage
// points while every other price field is a decimal, so it must stay unread.
const BYMA_BODY = [
  // Out of order on purpose: the shortest tenor is what the fetcher must pick.
  { denominationCcy: "ARS", daysToMaturity: 7, vwap: 0.21, settlementPrice: 21, previousClosingPrice: 0.21 },
  { denominationCcy: "ARS", daysToMaturity: 1, vwap: 0.199482607, settlementPrice: 20.1, previousClosingPrice: 0.19 },
  { denominationCcy: "USD", daysToMaturity: 1, vwap: 0.0095, settlementPrice: 0.95, previousClosingPrice: 0.01 },
  { denominationCcy: "USD", daysToMaturity: 22, vwap: 0, settlementPrice: 0, previousClosingPrice: 0.015 },
];

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
}

function textResponse(body: string) {
  return { ok: true, status: 200, text: async () => body, json: async () => JSON.parse(body) };
}

/**
 * Routes each provider's URL to its own canned payload. Tests override a single
 * entry to simulate one provider failing while the others stay healthy.
 */
function stubFetch(overrides: Partial<Record<"fred" | "bcra" | "byma", () => unknown>> = {}) {
  return vi.fn(async (url: string) => {
    if (url.includes("fred.stlouisfed.org")) {
      return (overrides.fred ?? (() => textResponse(FRED_CSV)))();
    }
    if (url.includes("api.bcra.gob.ar")) {
      return (overrides.bcra ?? (() => jsonResponse(BCRA_BODY)))();
    }
    if (url.includes("bymadata")) {
      return (overrides.byma ?? (() => jsonResponse(BYMA_BODY)))();
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

function rateFor(rates: { id: string }[], id: string) {
  return rates.find((rate) => rate.id === id);
}

describe("fetchRiskFreeRates", () => {
  beforeEach(() => {
    quote.mockReset();
    quote.mockResolvedValue(quoteYield(4.5));
    vi.stubGlobal("fetch", stubFetch());
    // The rates cache lives at module scope, so each test jumps past the TTL of
    // whatever the previous one cached and starts from a cold cache.
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 2 * 60 * 60 * 1000);
    // Failed lookups are logged by design; keep the expected noise out of the run.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterAll(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("quotes every instrument the picker offers", async () => {
    const rates = await fetchRiskFreeRates();

    expect(rates.map((r) => r.id)).toEqual(RISK_FREE_INSTRUMENTS.map((i) => i.id));
  });

  it("converts Yahoo's percentage-point yields to decimals", async () => {
    quote.mockImplementation(async (ticker: string) =>
      quoteYield(ticker === "^TNX" ? 4.7580004 : 3.735)
    );

    const rates = await fetchRiskFreeRates();

    expect(rateFor(rates, "us-treasury-10y")).toEqual({
      id: "us-treasury-10y",
      currency: "USD",
      source: "^TNX",
      rate: 0.04758,
      asOf: QUOTED_AT.toISOString(),
    });
  });

  it("reads the 2-year point from the last dated row FRED published", async () => {
    const rates = await fetchRiskFreeRates();

    expect(rateFor(rates, "us-treasury-2y")).toMatchObject({
      currency: "USD",
      source: "FRED · DGS2",
      rate: 0.0437,
      asOf: "2026-09-04T12:00:00.000Z",
    });
  });

  it("skips FRED's non-trading days rather than reading them as zero", async () => {
    vi.stubGlobal(
      "fetch",
      stubFetch({ fred: () => textResponse("observation_date,DGS2\n2026-09-03,4.34\n2026-09-04,.") })
    );

    expect(rateFor(await fetchRiskFreeRates(), "us-treasury-2y")).toMatchObject({
      rate: 0.0434,
      asOf: "2026-09-03T12:00:00.000Z",
    });
  });

  it("converts the BCRA deposit rate to a decimal", async () => {
    const rates = await fetchRiskFreeRates();

    expect(rateFor(rates, "ar-plazo-fijo-30d")).toMatchObject({
      currency: "ARS",
      rate: 0.2105,
      asOf: "2026-09-07T12:00:00.000Z",
    });
  });

  it("takes BYMA's shortest caución tenor in each currency, from the day's VWAP", async () => {
    const rates = await fetchRiskFreeRates();

    // VWAPs are decimals on the wire, so they pass through unscaled — reading
    // settlementPrice instead would have returned 20.1 (2010%) and 0.95 (95%).
    expect(rateFor(rates, "ar-caucion-ars")).toMatchObject({ currency: "ARS", rate: 0.199483 });
    expect(rateFor(rates, "ar-caucion-usd")).toMatchObject({ currency: "USD", rate: 0.0095 });
  });

  it("falls back to the previous close on a tenor that has not traded today", async () => {
    vi.stubGlobal(
      "fetch",
      stubFetch({
        byma: () =>
          jsonResponse([
            { denominationCcy: "ARS", daysToMaturity: 1, vwap: 0, previousClosingPrice: 0.19 },
          ]),
      })
    );

    expect(rateFor(await fetchRiskFreeRates(), "ar-caucion-ars")).toMatchObject({ rate: 0.19 });
  });

  it("ignores caución tenors with no price history at all", async () => {
    vi.stubGlobal(
      "fetch",
      stubFetch({
        byma: () =>
          jsonResponse([
            { denominationCcy: "ARS", daysToMaturity: 1, vwap: 0, previousClosingPrice: 0 },
            { denominationCcy: "ARS", daysToMaturity: 7, vwap: 0, previousClosingPrice: 0.21 },
          ]),
      })
    );

    const rates = await fetchRiskFreeRates();

    expect(rateFor(rates, "ar-caucion-ars")).toMatchObject({ rate: 0.21 });
    expect(rateFor(rates, "ar-caucion-usd")).toBeUndefined();
  });

  it("rejects a caución rate that is off by a factor of a hundred", async () => {
    vi.stubGlobal(
      "fetch",
      stubFetch({
        byma: () =>
          jsonResponse([
            // What the board would look like if `vwap` switched to percentage
            // points the way `settlementPrice` already publishes them.
            { denominationCcy: "ARS", daysToMaturity: 1, vwap: 20.1, previousClosingPrice: 19 },
          ]),
      })
    );

    expect(rateFor(await fetchRiskFreeRates(), "ar-caucion-ars")).toBeUndefined();
  });

  it("drops instruments that fail to quote instead of failing the request", async () => {
    quote.mockImplementation(async (ticker: string) => {
      if (ticker === "^IRX") throw new Error("Yahoo is down");
      if (ticker === "^FVX") return quoteYield(null);
      return quoteYield(4.5);
    });

    const rates = await fetchRiskFreeRates();

    expect(rateFor(rates, "us-t-bill-3m")).toBeUndefined();
    expect(rateFor(rates, "us-treasury-5y")).toBeUndefined();
    expect(rateFor(rates, "us-treasury-10y")).toBeDefined();
  });

  it("keeps the other providers when one is down", async () => {
    vi.stubGlobal(
      "fetch",
      stubFetch({
        byma: () => {
          throw new Error("BYMA is down");
        },
      })
    );

    const rates = await fetchRiskFreeRates();

    expect(rateFor(rates, "ar-caucion-ars")).toBeUndefined();
    expect(rateFor(rates, "ar-plazo-fijo-30d")).toBeDefined();
    expect(rateFor(rates, "us-treasury-2y")).toBeDefined();
  });

  it("serves later calls from the cache", async () => {
    await fetchRiskFreeRates();
    const callsAfterFirst = quote.mock.calls.length;
    await fetchRiskFreeRates();

    expect(quote.mock.calls.length).toBe(callsAfterFirst);
  });

  it("does not cache a total outage, so the next call retries", async () => {
    quote.mockRejectedValue(new Error("Yahoo is down"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("everything is down");
      })
    );
    expect(await fetchRiskFreeRates()).toEqual([]);

    quote.mockReset();
    quote.mockResolvedValue(quoteYield(4.5));
    vi.stubGlobal("fetch", stubFetch());
    expect(await fetchRiskFreeRates()).toHaveLength(RISK_FREE_INSTRUMENTS.length);
  });
});
