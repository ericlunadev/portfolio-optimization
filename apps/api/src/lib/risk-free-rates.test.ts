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

describe("fetchRiskFreeRates", () => {
  beforeEach(() => {
    quote.mockReset();
    // The rates cache lives at module scope, so each test jumps past the TTL of
    // whatever the previous one cached and starts from a cold cache.
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 2 * 60 * 60 * 1000);
    // Failed quotes are logged by design; keep the expected noise out of the run.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("converts Yahoo's percentage-point yields to decimals", async () => {
    quote.mockImplementation(async (ticker: string) =>
      quoteYield(ticker === "^TNX" ? 4.7580004 : 3.735)
    );

    const rates = await fetchRiskFreeRates();

    expect(rates).toHaveLength(RISK_FREE_INSTRUMENTS.length);
    expect(rates.find((r) => r.ticker === "^TNX")).toEqual({
      id: "us-treasury-10y",
      ticker: "^TNX",
      rate: 0.04758,
      asOf: QUOTED_AT.toISOString(),
    });
  });

  it("drops instruments that fail to quote instead of failing the request", async () => {
    quote.mockImplementation(async (ticker: string) => {
      if (ticker === "^IRX") throw new Error("Yahoo is down");
      if (ticker === "^FVX") return quoteYield(null);
      return quoteYield(4.5);
    });

    const rates = await fetchRiskFreeRates();

    expect(rates.map((r) => r.ticker).sort()).toEqual(["^TNX", "^TYX"]);
  });

  it("serves later calls from the cache", async () => {
    quote.mockResolvedValue(quoteYield(4.5));

    await fetchRiskFreeRates();
    const callsAfterFirst = quote.mock.calls.length;
    await fetchRiskFreeRates();

    expect(quote.mock.calls.length).toBe(callsAfterFirst);
  });

  it("does not cache a total outage, so the next call retries", async () => {
    quote.mockRejectedValue(new Error("Yahoo is down"));
    expect(await fetchRiskFreeRates()).toEqual([]);

    quote.mockReset();
    quote.mockResolvedValue(quoteYield(4.5));
    expect(await fetchRiskFreeRates()).toHaveLength(RISK_FREE_INSTRUMENTS.length);
  });
});
