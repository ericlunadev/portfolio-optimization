// Per-tenant fund allowlist (PLAN Task 3.1).
//
// `organization_settings.fund_allowlist` restricts what the ticker search will
// offer. Three properties matter, and each is asserted below:
//
//   * NULL, an empty string and `[]` all keep today's unrestricted search. This
//     is the default every existing organization has, so a regression here is a
//     regression for every D2C user.
//   * A populated allowlist filters the results.
//   * The two organizations in a test hold *different* allowlists, never one
//     restricted and one unrestricted only. If the reader dropped its
//     organization predicate and returned whichever settings row it found first,
//     one of the two assertions has to fail.
//
// Yahoo is mocked at the module boundary, the same shape `lib/risk-free-rates.test.ts`
// uses: the suite is about the filter, not about Yahoo's ranking.

import { describe, expect, it, vi } from "vitest";

const search = vi.fn();

vi.mock("yahoo-finance2", () => ({
  default: class {
    search = search;
  },
}));

const { db } = await import("../../db/index.js");
const { organizationSettings } = await import("../../db/schema.js");
const { getFundAllowlist, invalidateTenantSettings } = await import(
  "../../lib/tenant-settings.js"
);
const { asAnonymous, asUser, seedOrg, seedUser } = await import("../../test/factories.js");
const { eq } = await import("drizzle-orm");

// What Yahoo answers for every query in this file: two allowlist candidates, one
// instrument nobody allows, and a quote type the search has always dropped.
const QUOTES = [
  { symbol: "AAPL", quoteType: "EQUITY", shortname: "Apple Inc.", exchange: "NMS" },
  { symbol: "VOO", quoteType: "ETF", shortname: "Vanguard S&P 500 ETF", exchange: "PCX" },
  { symbol: "TSLA", quoteType: "EQUITY", shortname: "Tesla, Inc.", exchange: "NMS" },
  { symbol: "VFIAX", quoteType: "MUTUALFUND", shortname: "Vanguard 500 Index", exchange: "NAS" },
];

type TickerResult = { symbol: string; name: string; exchange: string; type: string };

function mockYahoo(quotes: unknown[] = QUOTES) {
  search.mockReset();
  search.mockResolvedValue({ quotes });
}

/**
 * Writes the column directly: `seedOrg` has no `fundAllowlist` override, and the
 * settings reader caches, so the write has to be followed by an invalidation the
 * way a real settings write will be.
 */
async function setAllowlist(organizationId: string, value: string | null): Promise<void> {
  await db
    .update(organizationSettings)
    .set({ fundAllowlist: value })
    .where(eq(organizationSettings.organizationId, organizationId));
  invalidateTenantSettings(organizationId);
}

async function searchAs(fetchAs: ReturnType<typeof asAnonymous>): Promise<TickerResult[]> {
  const res = await fetchAs("/api/historical/search?q=van");
  expect(res.status).toBe(200);
  return (await res.json()) as TickerResult[];
}

function symbols(results: TickerResult[]): string[] {
  return results.map((result) => result.symbol);
}

describe("ticker search — unrestricted tenants", () => {
  it("returns every equity and ETF Yahoo offers when fund_allowlist is NULL", async () => {
    mockYahoo();
    const analyst = await seedUser({ organizationId: (await seedOrg()).id });

    expect(symbols(await searchAs(asUser(analyst)))).toEqual(["AAPL", "VOO", "TSLA"]);
  });

  it("treats an empty JSON array as unrestricted", async () => {
    mockYahoo();
    const org = await seedOrg();
    const analyst = await seedUser({ organizationId: org.id });
    await setAllowlist(org.id, "[]");

    expect(symbols(await searchAs(asUser(analyst)))).toEqual(["AAPL", "VOO", "TSLA"]);
  });

  it("asks Yahoo for the same ten candidates it always did", async () => {
    mockYahoo();
    const analyst = await seedUser({ organizationId: (await seedOrg()).id });

    await searchAs(asUser(analyst));

    expect(search).toHaveBeenCalledWith("van", { quotesCount: 10 }, { validateResult: false });
  });

  it("leaves an anonymous caller unrestricted — the route has never required a session", async () => {
    mockYahoo();

    expect(symbols(await searchAs(asAnonymous()))).toEqual(["AAPL", "VOO", "TSLA"]);
  });
});

describe("ticker search — restricted tenants", () => {
  it("returns only the tickers on the tenant's allowlist", async () => {
    mockYahoo();
    const org = await seedOrg({ name: "Restricted firm" });
    const analyst = await seedUser({ organizationId: org.id });
    await setAllowlist(org.id, JSON.stringify(["AAPL", "VOO"]));

    expect(symbols(await searchAs(asUser(analyst)))).toEqual(["AAPL", "VOO"]);
  });

  it("matches tickers case-insensitively", async () => {
    mockYahoo();
    const org = await seedOrg();
    const analyst = await seedUser({ organizationId: org.id });
    await setAllowlist(org.id, JSON.stringify([" voo ", "aapl"]));

    expect(symbols(await searchAs(asUser(analyst)))).toEqual(["AAPL", "VOO"]);
  });

  it("still drops instrument types the search never offered", async () => {
    mockYahoo();
    const org = await seedOrg();
    const analyst = await seedUser({ organizationId: org.id });
    // VFIAX is a mutual fund: allowlisted, and still not an EQUITY or an ETF.
    await setAllowlist(org.id, JSON.stringify(["VFIAX", "VOO"]));

    expect(symbols(await searchAs(asUser(analyst)))).toEqual(["VOO"]);
  });

  it("widens the candidate set so an approved fund outside Yahoo's top ten survives the filter", async () => {
    // Yahoo ranks 12 instruments ahead of the one this tenant approved.
    const noise = Array.from({ length: 12 }, (_, i) => ({
      symbol: `NOISE${i}`,
      quoteType: "EQUITY",
      shortname: `Noise ${i}`,
      exchange: "NMS",
    }));
    mockYahoo([...noise, { symbol: "VOO", quoteType: "ETF", shortname: "Vanguard", exchange: "PCX" }]);

    const org = await seedOrg();
    const analyst = await seedUser({ organizationId: org.id });
    await setAllowlist(org.id, JSON.stringify(["VOO"]));

    expect(search).not.toHaveBeenCalled();
    expect(symbols(await searchAs(asUser(analyst)))).toEqual(["VOO"]);
    expect(search).toHaveBeenCalledWith("van", { quotesCount: 30 }, { validateResult: false });
  });

  it("never returns more than ten results", async () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      symbol: `ALLOWED${i}`,
      quoteType: "EQUITY",
      shortname: `Allowed ${i}`,
      exchange: "NMS",
    }));
    mockYahoo(many);

    const org = await seedOrg();
    const analyst = await seedUser({ organizationId: org.id });
    await setAllowlist(org.id, JSON.stringify(many.map((quote) => quote.symbol)));

    expect(await searchAs(asUser(analyst))).toHaveLength(10);
  });

  it("denies every ticker when the allowlist cannot be read, rather than serving all of Yahoo", async () => {
    mockYahoo();
    const org = await seedOrg();
    const analyst = await seedUser({ organizationId: org.id });
    await setAllowlist(org.id, "AAPL,VOO");

    // The parse failure is logged on purpose; keep the expected noise out of the run.
    const silenced = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await searchAs(asUser(analyst))).toEqual([]);
      expect(silenced).toHaveBeenCalled();
    } finally {
      silenced.mockRestore();
    }
  });
});

describe("ticker search — one tenant's allowlist does not reach another", () => {
  it("gives each analyst their own organization's allowlist", async () => {
    mockYahoo();
    const orgA = await seedOrg({ name: "Tenant A" });
    const orgB = await seedOrg({ name: "Tenant B" });
    const analystA = await seedUser({ organizationId: orgA.id });
    const analystB = await seedUser({ organizationId: orgB.id });

    await setAllowlist(orgA.id, JSON.stringify(["AAPL"]));
    await setAllowlist(orgB.id, JSON.stringify(["VOO", "TSLA"]));

    expect(symbols(await searchAs(asUser(analystA)))).toEqual(["AAPL"]);
    expect(symbols(await searchAs(asUser(analystB)))).toEqual(["VOO", "TSLA"]);
  });

  it("does not restrict a tenant that has no allowlist because another tenant has one", async () => {
    mockYahoo();
    const restricted = await seedOrg({ name: "Restricted" });
    const open = await seedOrg({ name: "Open" });
    const analystRestricted = await seedUser({ organizationId: restricted.id });
    const analystOpen = await seedUser({ organizationId: open.id });

    await setAllowlist(restricted.id, JSON.stringify(["AAPL"]));

    expect(symbols(await searchAs(asUser(analystRestricted)))).toEqual(["AAPL"]);
    expect(symbols(await searchAs(asUser(analystOpen)))).toEqual(["AAPL", "VOO", "TSLA"]);
  });
});

describe("tenant settings cache", () => {
  it("serves a cached row until the entry is invalidated", async () => {
    const org = await seedOrg();
    await setAllowlist(org.id, JSON.stringify(["AAPL"]));

    expect(await getFundAllowlist(org.id)).toEqual(new Set(["AAPL"]));

    // A write that skips the invalidation the accessor asks for: the TTL is what
    // bounds the staleness, and it has not expired inside one test.
    await db
      .update(organizationSettings)
      .set({ fundAllowlist: JSON.stringify(["VOO"]) })
      .where(eq(organizationSettings.organizationId, org.id));

    expect(await getFundAllowlist(org.id)).toEqual(new Set(["AAPL"]));

    invalidateTenantSettings(org.id);
    expect(await getFundAllowlist(org.id)).toEqual(new Set(["VOO"]));
  });

  it("reports an organization with no settings row as unrestricted", async () => {
    await expect(getFundAllowlist("org-that-does-not-exist")).resolves.toBeNull();
  });
});
