import { describe, expect, it } from "vitest";
import { planReplay } from "./replay.js";

const WEB_PARAMS = {
  tickers: ["SPY", "TLT"],
  assets: [
    { ticker: "SPY", allocation: null, minWeight: 10, maxWeight: null },
    { ticker: "TLT", allocation: null, minWeight: null, maxWeight: 70 },
  ],
  dateRange: { startMonth: 3, startYear: 2019, endMonth: 6, endYear: 2025 },
  strategy: "max-sharpe",
  targetReturn: 0.12,
  riskFreeRate: 0.04,
  enforceFullInvestment: true,
  allowShortSelling: false,
  useLeverage: false,
  maxLeverage: 2,
  assetConstraints: true,
  wMax: 0.8,
  assetLimits: true,
  showFrontier: true,
  benchmarks: ["sp500"],
};

/** The shape `apps/mobile` saves: the optimize request itself. */
const MOBILE_PARAMS = {
  tickers: ["SPY", "TLT"],
  strategy: "max-sharpe",
  w_max: 1,
  risk_free_rate: 0.04,
  start_date: "2019-03-01",
  end_date: "2025-06-30",
};

const NOW = new Date("2026-09-16T06:30:00Z");

describe("planReplay", () => {
  it("replays web params the way useRerunSimulation does", () => {
    const plan = planReplay(JSON.stringify(WEB_PARAMS), NOW, "UTC");
    if (!plan.ok) throw new Error(plan.reason);

    expect(plan.optimizeParams).toEqual({
      tickers: ["SPY", "TLT"],
      strategy: "max-sharpe",
      w_max: 0.8,
      w_min_per_asset: [0.1, null],
      w_max_per_asset: [null, 0.7],
      risk_free_rate: 0.04,
      // Not read by max-sharpe, so not sent.
      target_return: undefined,
      target_risk: undefined,
      cvar_confidence: 0.95,
      view_confidence: 0.5,
      start_date: "2019-03-01",
      end_date: "2026-09-30",
      enforce_full_investment: true,
      allow_short_selling: false,
      max_leverage: 1,
    });
  });

  it("moves only the end month, and keeps fields it does not read", () => {
    const plan = planReplay(JSON.stringify(WEB_PARAMS), NOW, "UTC");
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.params).toEqual({
      ...WEB_PARAMS,
      dateRange: { startMonth: 3, startYear: 2019, endMonth: 9, endYear: 2026 },
    });
  });

  it("takes the current month from the schedule's timezone", () => {
    // 1 Oct 02:00 UTC is still 30 September in Mexico City.
    const now = new Date("2026-10-01T02:00:00Z");
    const local = planReplay(JSON.stringify(WEB_PARAMS), now, "America/Mexico_City");
    const utc = planReplay(JSON.stringify(WEB_PARAMS), now, "UTC");
    if (!local.ok || !utc.ok) throw new Error("expected replayable");
    expect(local.optimizeParams.end_date).toBe("2026-09-30");
    expect(utc.optimizeParams.end_date).toBe("2026-10-31");
  });

  it("ignores switched-off constraints and leverage like the web app", () => {
    const plan = planReplay(
      JSON.stringify({ ...WEB_PARAMS, assetConstraints: false, assetLimits: false, useLeverage: true }),
      NOW,
      "UTC"
    );
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.optimizeParams.w_max).toBe(1);
    expect(plan.optimizeParams.w_min_per_asset).toBeUndefined();
    expect(plan.optimizeParams.max_leverage).toBe(2);
  });

  it("sends the target a target strategy needs", () => {
    const plan = planReplay(JSON.stringify({ ...WEB_PARAMS, strategy: "target-return" }), NOW, "UTC");
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.optimizeParams.target_return).toBe(0.12);
    expect(plan.optimizeParams.risk_free_rate).toBe(0);
  });

  it("rejects mobile-shaped params without throwing", () => {
    expect(planReplay(JSON.stringify(MOBILE_PARAMS), NOW, "UTC")).toEqual({
      ok: false,
      reason: "unreplayable_params",
    });
  });

  it("rejects garbage and inputs the optimizer would refuse", () => {
    expect(planReplay("{not json", NOW, "UTC")).toEqual({ ok: false, reason: "unparseable_params" });
    expect(
      planReplay(
        JSON.stringify({ ...WEB_PARAMS, strategy: "target-risk", targetRisk: undefined }),
        NOW,
        "UTC"
      )
    ).toEqual({ ok: false, reason: "missing_strategy_target" });
    expect(
      planReplay(
        JSON.stringify({
          ...WEB_PARAMS,
          assets: [
            { ticker: "SPY", allocation: null, minWeight: 70, maxWeight: null },
            { ticker: "TLT", allocation: null, minWeight: 60, maxWeight: null },
          ],
        }),
        NOW,
        "UTC"
      )
    ).toEqual({ ok: false, reason: "min_weights_exceed_total" });
  });
});
