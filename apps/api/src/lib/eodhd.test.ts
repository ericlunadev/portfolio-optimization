import { afterEach, describe, expect, it, vi } from "vitest";
import { EodhdUnavailableError, fetchEodhdPrices, toEodhdSymbol } from "./eodhd.js";

describe("toEodhdSymbol", () => {
  it.each([
    ["AAPL", "AAPL.US"],
    ["brk-b", "BRK-B.US"],
    ["^GSPC", "GSPC.INDX"],
    ["^N225", "N225.INDX"],
    ["BTC-USD", "BTC-USD.CC"],
    ["EURUSD=X", "EURUSD.FOREX"],
    ["MXN=X", "USDMXN.FOREX"],
    ["VOD.L", "VOD.LSE"],
    ["SAP.DE", "SAP.XETRA"],
    ["SAN.MC", "SAN.MC"],
    ["WALMEX.MX", "WALMEX.MX"],
    ["BHP.AX", "BHP.AU"],
    ["7203.T", "7203.TSE"],
    // An unlisted suffix passes through.
    ["FOO.XY", "FOO.XY"],
  ])("%s → %s", (yahoo, eodhd) => {
    expect(toEodhdSymbol(yahoo)).toBe(eodhd);
  });

  it("has no equivalent for futures", () => {
    expect(toEodhdSymbol("GC=F")).toBeNull();
  });
});

describe("fetchEodhdPrices", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function stubFetch(handler: (url: URL) => Response) {
    const fetchMock = vi.fn(async (input: URL | string) => handler(new URL(String(input))));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("prices by adjusted close, keyed by the caller's symbol", async () => {
    const fetchMock = stubFetch(() =>
      Response.json([
        { date: "2024-01-02", close: 200, adjusted_close: 100, volume: 1 },
        { date: "2024-01-03", close: 202, adjusted_close: 101, volume: 1 },
        { date: "2024-01-04", close: null, adjusted_close: null, volume: 0 },
      ])
    );

    const prices = await fetchEodhdPrices(["^GSPC"], "2024-01-01", "2024-01-31", "token");

    expect(prices.get("^GSPC")).toEqual([
      { date: "2024-01-02", close: 100 },
      { date: "2024-01-03", close: 101 },
    ]);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe("/api/eod/GSPC.INDX");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      api_token: "token",
      fmt: "json",
      from: "2024-01-01",
      to: "2024-01-31",
    });
  });

  it("returns an empty series for a symbol EODHD cannot price", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubFetch((url) =>
      url.pathname.endsWith("NOPE.US")
        ? new Response("Ticker Not Found.", { status: 404 })
        : Response.json([{ date: "2024-01-02", close: 1, adjusted_close: 1 }])
    );

    const prices = await fetchEodhdPrices(["NOPE", "SPY", "GC=F"], "2024-01-01", "2024-01-31", "t");

    expect(prices.get("NOPE")).toEqual([]);
    expect(prices.get("GC=F")).toEqual([]);
    expect(prices.get("SPY")).toHaveLength(1);
  });

  it("throws when the provider itself is unusable", async () => {
    stubFetch(() => new Response("Unauthenticated", { status: 401 }));

    await expect(
      fetchEodhdPrices(["SPY"], "2024-01-01", "2024-01-31", "bad")
    ).rejects.toBeInstanceOf(EodhdUnavailableError);
  });
});
