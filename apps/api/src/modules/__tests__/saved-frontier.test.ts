// Reopening a saved simulation must not spend a credit, and nothing about that
// may turn into free computation.
//
// The bug: the results page drew the frontier through the metered
// `POST /api/optimization/efficient-frontier-tickers` on every render, so each
// reload, reopen or return to a saved simulation cost 1 credit on top of the 2
// that creating it had. The fix reads the frontier through the saved row
// (`POST /api/optimization/simulations/:id/frontier`, saved-frontier.ts).
//
// Prices are mocked at `lib/yahoo.ts`, and every call is recorded, so a test can
// say not only what was charged but what was actually computed.

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const market = vi.hoisted(() => ({
  calls: [] as { tickers: string[]; period1: string; period2: string }[],
  failuresLeft: 0,
}));

vi.mock("../../lib/yahoo.js", () => ({
  fetchTickerPrices: async (tickers: string[], period1: string, period2: string) => {
    market.calls.push({ tickers: [...tickers], period1, period2 });
    if (market.failuresLeft > 0) {
      market.failuresLeft -= 1;
      throw new Error("market data unavailable");
    }
    // Deterministic, distinct series per ticker, so the optimizer has a real
    // covariance matrix to work with.
    return new Map(
      tickers.map((ticker, k) => {
        let close = 100;
        const points = Array.from({ length: 260 }, (_, t) => {
          close *= Math.exp(0.0004 * (k + 1) + 0.01 * Math.sin((t + 1) * (k + 2) * 0.37));
          const date = new Date(Date.UTC(2021, 0, 1 + t)).toISOString().slice(0, 10);
          return { date, close };
        });
        return [ticker, points] as const;
      })
    );
  },
}));

const { db } = await import("../../db/index.js");
const { creditLedger } = await import("../../db/schema.js");
const { grantCredits } = await import("../../lib/billing/spend.js");
const { frontierRequestFromSimulationParams, savedFrontierIdempotencyKey } = await import(
  "../optimization/saved-frontier.js"
);
const { asUser, seedOrg, seedSimulation, seedUser } = await import("../../test/factories.js");
type SeededUser = Awaited<ReturnType<typeof seedUser>>;

/** A simulation as the web app saves it (`SimulationParams`). */
function webParams(overrides: Record<string, unknown> = {}) {
  return {
    tickers: ["SPY", "GLD", "TLT"],
    assets: [
      { ticker: "SPY", allocation: null, minWeight: null, maxWeight: null },
      { ticker: "GLD", allocation: null, minWeight: null, maxWeight: null },
      { ticker: "TLT", allocation: null, minWeight: null, maxWeight: null },
    ],
    dateRange: { startMonth: 1, startYear: 2021, endMonth: 12, endYear: 2025 },
    strategy: "max-sharpe",
    riskFreeRate: 0.05,
    enforceFullInvestment: true,
    allowShortSelling: false,
    useLeverage: false,
    maxLeverage: 1.5,
    assetConstraints: false,
    wMax: 0.4,
    assetLimits: false,
    showFrontier: true,
    ...overrides,
  };
}

async function fundedAnalyst(credits = 20): Promise<SeededUser> {
  const org = await seedOrg();
  await grantCredits({
    organizationId: org.id,
    userId: null,
    credits,
    reason: "grant",
    idempotencyKey: `test-grant:${org.id}`,
  });
  return seedUser({ organizationId: org.id });
}

async function credits(analyst: SeededUser): Promise<number> {
  const response = await asUser(analyst)("/api/billing/wallet");
  return ((await response.json()) as { credits: number }).credits;
}

async function spendRows(organizationId: string) {
  return db
    .select()
    .from(creditLedger)
    .where(and(eq(creditLedger.organizationId, organizationId), eq(creditLedger.reason, "spend")));
}

function openFrontier(analyst: SeededUser, simulationId: string, init: Parameters<ReturnType<typeof asUser>>[1] = {}) {
  return asUser(analyst)(`/api/optimization/simulations/${simulationId}/frontier`, {
    method: "POST",
    ...init,
  });
}

async function savedSimulation(analyst: SeededUser, params = webParams()) {
  return seedSimulation({ organizationId: analyst.organizationId, userId: analyst.id, params });
}

beforeEach(() => {
  market.calls.length = 0;
  market.failuresLeft = 0;
});

describe("opening a saved simulation", () => {
  it("charges the first frontier once, and leaves the wallet unchanged on every reopen after", async () => {
    const analyst = await fundedAnalyst();
    const simulation = await savedSimulation(analyst);

    const first = await openFrontier(analyst, simulation.id);
    expect(first.status).toBe(200);
    const afterFirstView = await credits(analyst);
    expect(afterFirstView).toBe(19);

    const reopen = await openFrontier(analyst, simulation.id);
    const reopenAgain = await openFrontier(analyst, simulation.id);

    expect(reopen.status).toBe(200);
    expect(reopenAgain.status).toBe(200);
    expect(await credits(analyst)).toBe(afterFirstView);
    expect(await spendRows(analyst.organizationId)).toHaveLength(1);
    // Free, but still the real frontier.
    expect(await reopenAgain.json()).toEqual(await first.clone().json());
  });

  it("costs exactly what creating a simulation cost before: the optimization plus the first frontier", async () => {
    const analyst = await fundedAnalyst();
    const fetch = asUser(analyst);
    const params = webParams();

    const optimized = await fetch("/api/optimization/optimize", {
      method: "POST",
      json: {
        tickers: params.tickers,
        strategy: "max-sharpe",
        w_max: 1,
        risk_free_rate: 0.05,
        start_date: "2021-01-01",
        end_date: "2025-12-31",
      },
    });
    expect(optimized.status).toBe(200);

    const saved = await fetch("/api/simulations", {
      method: "POST",
      json: { params, result: await optimized.json() },
    });
    expect(saved.status).toBe(201);
    const { id } = (await saved.json()) as { id: string };

    expect((await openFrontier(analyst, id)).status).toBe(200);

    expect(await credits(analyst)).toBe(20 - 2);
  });

  it("lets an organization member open a colleague's shared simulation without paying again", async () => {
    const owner = await fundedAnalyst();
    const colleague = await seedUser({ organizationId: owner.organizationId });
    const simulation = await seedSimulation({
      organizationId: owner.organizationId,
      userId: owner.id,
      params: webParams(),
      sharedWithOrg: true,
    });

    expect((await openFrontier(owner, simulation.id)).status).toBe(200);
    expect((await openFrontier(colleague, simulation.id)).status).toBe(200);

    expect(await credits(owner)).toBe(19);
  });
});

describe("new computation still charges", () => {
  it("charges a re-run: the optimization, and the frontier for the parameters it saved", async () => {
    const analyst = await fundedAnalyst();
    const fetch = asUser(analyst);
    const simulation = await savedSimulation(analyst);
    expect((await openFrontier(analyst, simulation.id)).status).toBe(200);
    expect(await credits(analyst)).toBe(19);

    // What `useRerunSimulation` sends: a fresh optimization up to today, then a
    // PUT of the moved date range and the new result.
    const rerun = await fetch("/api/optimization/optimize", {
      method: "POST",
      json: { tickers: ["SPY", "GLD", "TLT"], strategy: "max-sharpe", start_date: "2021-01-01", end_date: "2026-09-30" },
    });
    expect(rerun.status).toBe(200);
    const nextParams = webParams({ dateRange: { startMonth: 1, startYear: 2021, endMonth: 9, endYear: 2026 } });
    const put = await fetch(`/api/simulations/${simulation.id}`, {
      method: "PUT",
      json: { params: nextParams, result: await rerun.json() },
    });
    expect(put.status).toBe(200);

    expect((await openFrontier(analyst, simulation.id)).status).toBe(200);
    expect(await credits(analyst)).toBe(19 - 2);
    expect(market.calls.at(-1)).toMatchObject({ period1: "2021-01-01", period2: "2026-09-30" });

    // And the re-run's frontier, once paid, reopens free like any other.
    expect((await openFrontier(analyst, simulation.id)).status).toBe(200);
    expect(await credits(analyst)).toBe(17);
  });

  it("makes a second simulation with identical parameters pay for its own frontier", async () => {
    const analyst = await fundedAnalyst();
    const first = await savedSimulation(analyst);
    const second = await savedSimulation(analyst);

    await openFrontier(analyst, first.id);
    await openFrontier(analyst, second.id);

    expect(await credits(analyst)).toBe(18);
  });

  it("still charges the ticker route on every call", async () => {
    const analyst = await fundedAnalyst();
    const body = { tickers: ["SPY", "GLD"], start_date: "2021-01-01", end_date: "2025-12-31" };

    for (let i = 0; i < 2; i++) {
      const response = await asUser(analyst)("/api/optimization/efficient-frontier-tickers", {
        method: "POST",
        json: body,
      });
      expect(response.status).toBe(200);
    }

    expect(await credits(analyst)).toBe(18);
  });
});

describe("a reopen cannot be turned into free computation", () => {
  it("answers 404 for another organization's simulation, computing and charging nothing", async () => {
    const victim = await fundedAnalyst();
    const simulation = await savedSimulation(victim);
    expect((await openFrontier(victim, simulation.id)).status).toBe(200);
    market.calls.length = 0;

    const attacker = await fundedAnalyst();
    const response = await openFrontier(attacker, simulation.id);

    expect(response.status).toBe(404);
    expect(market.calls).toHaveLength(0);
    expect(await credits(attacker)).toBe(20);
    expect(await credits(victim)).toBe(19);
  });

  it("answers 404 for a colleague's simulation that is not shared", async () => {
    const owner = await fundedAnalyst();
    const colleague = await seedUser({ organizationId: owner.organizationId });
    const simulation = await savedSimulation(owner);

    expect((await openFrontier(colleague, simulation.id)).status).toBe(404);
    expect(market.calls).toHaveLength(0);
  });

  it("computes the saved tickers and dates whatever the request carries", async () => {
    const analyst = await fundedAnalyst();
    const simulation = await savedSimulation(analyst);
    expect((await openFrontier(analyst, simulation.id)).status).toBe(200);
    market.calls.length = 0;

    const response = await openFrontier(analyst, simulation.id, {
      json: {
        tickers: ["TSLA", "NVDA"],
        start_date: "2010-01-01",
        end_date: "2011-12-31",
        w_max: 0.1,
      },
      headers: { "Idempotency-Key": `frontier:${simulation.id}` },
    });

    expect(response.status).toBe(200);
    expect(((await response.json()) as { tickers: string[] }).tickers).toEqual(["SPY", "GLD", "TLT"]);
    expect(market.calls).toEqual([{ tickers: ["SPY", "GLD", "TLT"], period1: "2021-01-01", period2: "2025-12-31" }]);
    expect(await credits(analyst)).toBe(19);
  });

  it("charges again once the stored tickers are changed, so a reopen never covers other tickers", async () => {
    const analyst = await fundedAnalyst();
    const simulation = await savedSimulation(analyst);
    expect((await openFrontier(analyst, simulation.id)).status).toBe(200);

    const put = await asUser(analyst)(`/api/simulations/${simulation.id}`, {
      method: "PUT",
      json: {
        params: webParams({
          tickers: ["TSLA", "NVDA"],
          assets: [{ ticker: "TSLA" }, { ticker: "NVDA" }],
          dateRange: { startMonth: 1, startYear: 2015, endMonth: 6, endYear: 2016 },
        }),
        result: {},
      },
    });
    expect(put.status).toBe(200);

    const response = await openFrontier(analyst, simulation.id);
    expect(response.status).toBe(200);
    expect(market.calls.at(-1)).toEqual({ tickers: ["TSLA", "NVDA"], period1: "2015-01-01", period2: "2016-06-30" });
    expect(await credits(analyst)).toBe(18);
  });

  it("does not let the server's replay key buy other tickers through the ticker route", async () => {
    const analyst = await fundedAnalyst();
    const simulation = await savedSimulation(analyst);
    expect((await openFrontier(analyst, simulation.id)).status).toBe(200);

    const serverKey = savedFrontierIdempotencyKey(
      simulation.id,
      frontierRequestFromSimulationParams(webParams())!
    );
    const response = await asUser(analyst)("/api/optimization/efficient-frontier-tickers", {
      method: "POST",
      headers: { "Idempotency-Key": serverKey },
      json: { tickers: ["TSLA", "NVDA"], start_date: "2010-01-01", end_date: "2011-12-31" },
    });

    expect(response.status).toBe(200);
    expect(await credits(analyst)).toBe(18);
  });

  it("refuses stored parameters it cannot derive a frontier from, before charging", async () => {
    const analyst = await fundedAnalyst();
    // The shape the mobile app saves (snake_case, no date range).
    const simulation = await seedSimulation({
      organizationId: analyst.organizationId,
      userId: analyst.id,
      params: { tickers: ["SPY", "GLD"], strategy: "max-sharpe", start_date: "2021-01-01" },
    });

    expect((await openFrontier(analyst, simulation.id)).status).toBe(422);
    expect(market.calls).toHaveLength(0);
    expect(await credits(analyst)).toBe(20);
  });
});

describe("after a failed computation", () => {
  it("refunds the failure, and does not treat the refunded spend as paid", async () => {
    const analyst = await fundedAnalyst();
    const simulation = await savedSimulation(analyst);

    market.failuresLeft = 1;
    const failed = await openFrontier(analyst, simulation.id);
    expect(failed.status).toBe(500);
    expect(await credits(analyst)).toBe(20);

    // The frontier nobody paid for is paid for now...
    expect((await openFrontier(analyst, simulation.id)).status).toBe(200);
    expect(await credits(analyst)).toBe(19);

    // ...and only once.
    expect((await openFrontier(analyst, simulation.id)).status).toBe(200);
    expect(await credits(analyst)).toBe(19);
  });

  it("keeps charging for each success after repeated refunds, never for free", async () => {
    const analyst = await fundedAnalyst();
    const simulation = await savedSimulation(analyst);

    for (let i = 0; i < 3; i++) {
      market.failuresLeft = 1;
      expect((await openFrontier(analyst, simulation.id)).status).toBe(500);
    }
    expect(await credits(analyst)).toBe(20);

    expect((await openFrontier(analyst, simulation.id)).status).toBe(200);
    expect(await credits(analyst)).toBe(19);
  });

  it("does not refund the earlier paid view when a free reopen fails", async () => {
    const analyst = await fundedAnalyst();
    const simulation = await savedSimulation(analyst);
    expect((await openFrontier(analyst, simulation.id)).status).toBe(200);

    market.failuresLeft = 1;
    expect((await openFrontier(analyst, simulation.id)).status).toBe(500);
    expect(await credits(analyst)).toBe(19);

    expect((await openFrontier(analyst, simulation.id)).status).toBe(200);
    expect(await credits(analyst)).toBe(19);
  });
});

describe("frontierRequestFromSimulationParams", () => {
  it("builds the request the web results page sent", () => {
    expect(frontierRequestFromSimulationParams(webParams())).toEqual({
      tickers: ["SPY", "GLD", "TLT"],
      start_date: "2021-01-01",
      end_date: "2025-12-31",
      w_max: 1,
      enforce_full_investment: true,
      allow_short_selling: false,
      max_leverage: 1,
    });
  });

  it("applies the switches the way MarkowitzResults does", () => {
    const request = frontierRequestFromSimulationParams(
      webParams({
        dateRange: { startMonth: 3, startYear: 2020, endMonth: 2, endYear: 2024 },
        assetConstraints: true,
        wMax: 0.4,
        useLeverage: true,
        maxLeverage: 1.5,
        allowShortSelling: true,
        enforceFullInvestment: false,
        assetLimits: true,
        assets: [
          { ticker: "SPY", minWeight: 10, maxWeight: 60 },
          { ticker: "", minWeight: 50, maxWeight: 50 },
          { ticker: "GLD", minWeight: null, maxWeight: 25 },
          { ticker: "TLT", minWeight: null, maxWeight: null },
        ],
      })
    );

    expect(request).toEqual({
      tickers: ["SPY", "GLD", "TLT"],
      start_date: "2020-03-01",
      // 2024 is a leap year.
      end_date: "2024-02-29",
      w_max: 0.4,
      w_min_per_asset: [0.1, null, null],
      w_max_per_asset: [0.6, 0.25, null],
      enforce_full_investment: false,
      allow_short_selling: true,
      max_leverage: 1.5,
    });
  });

  it("leaves per-asset limits out when none is set, as the web does", () => {
    const request = frontierRequestFromSimulationParams(webParams({ assetLimits: true }));
    expect(request).not.toBeNull();
    expect(request?.w_min_per_asset).toBeUndefined();
    expect(request?.w_max_per_asset).toBeUndefined();
  });

  it.each([
    ["no params", null],
    ["one ticker", webParams({ tickers: ["SPY"] })],
    ["no date range", webParams({ dateRange: undefined })],
    ["a month out of range", webParams({ dateRange: { startMonth: 13, startYear: 2021, endMonth: 1, endYear: 2022 } })],
    ["a cap out of range", webParams({ assetConstraints: true, wMax: 7 })],
  ])("returns null for %s", (_label, params) => {
    expect(frontierRequestFromSimulationParams(params)).toBeNull();
  });

  it("keys the replay on the simulation and the derived request", () => {
    const request = frontierRequestFromSimulationParams(webParams())!;
    const moved = frontierRequestFromSimulationParams(
      webParams({ dateRange: { startMonth: 1, startYear: 2021, endMonth: 9, endYear: 2026 } })
    )!;
    const id = randomUUID();

    expect(savedFrontierIdempotencyKey(id, request)).toBe(savedFrontierIdempotencyKey(id, { ...request }));
    expect(savedFrontierIdempotencyKey(id, request)).not.toBe(savedFrontierIdempotencyKey(id, moved));
    expect(savedFrontierIdempotencyKey(id, request)).not.toBe(savedFrontierIdempotencyKey(randomUUID(), request));
    expect(savedFrontierIdempotencyKey(id, request).startsWith(`frontier:${id}:`)).toBe(true);
  });
});
