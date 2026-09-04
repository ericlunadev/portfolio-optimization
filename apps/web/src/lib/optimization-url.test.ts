import { describe, expect, it } from "vitest";
import {
  decodeFormState,
  defaultFormState,
  encodeFormState,
  OptimizationFormState,
} from "./optimization-url";
import { OPTIMIZATION_STRATEGIES, strategyUsesParam } from "./api";

const YEAR = 2026;

function stateWith(overrides: Partial<OptimizationFormState>): OptimizationFormState {
  return { ...defaultFormState(YEAR), ...overrides };
}

/** Ids are random per row, so compare everything else. */
function assetsWithoutIds(state: OptimizationFormState) {
  return state.assets.map(({ id: _id, ...rest }) => rest);
}

describe("optimization-url asset weight limits", () => {
  it("keeps a pristine form out of the query string", () => {
    expect(encodeFormState(defaultFormState(YEAR), YEAR).toString()).toBe("");
  });

  it("round-trips per-asset limits", () => {
    const state = stateWith({
      assetLimits: true,
      assets: [
        { id: "a", ticker: "AAPL", allocation: 60, minWeight: 10, maxWeight: 40 },
        { id: "b", ticker: "MSFT", allocation: 40, minWeight: null, maxWeight: 25 },
      ],
    });

    const decoded = decodeFormState(encodeFormState(state, YEAR), YEAR);

    expect(decoded.assetLimits).toBe(true);
    expect(assetsWithoutIds(decoded)).toEqual([
      { ticker: "AAPL", allocation: 60, minWeight: 10, maxWeight: 40 },
      { ticker: "MSFT", allocation: 40, minWeight: null, maxWeight: 25 },
    ]);
  });

  it("omits the limit fields for rows that set none", () => {
    const state = stateWith({
      assets: [{ id: "a", ticker: "AAPL", allocation: 60, minWeight: null, maxWeight: null }],
    });

    expect(encodeFormState(state, YEAR).get("assets")).toBe("AAPL~60");
  });

  it("reads a link written before limits existed", () => {
    const decoded = decodeFormState(
      new URLSearchParams("assets=AAPL~60,MSFT~40"),
      YEAR
    );

    expect(decoded.assetLimits).toBe(false);
    expect(assetsWithoutIds(decoded)).toEqual([
      { ticker: "AAPL", allocation: 60, minWeight: null, maxWeight: null },
      { ticker: "MSFT", allocation: 40, minWeight: null, maxWeight: null },
    ]);
  });

  it("keeps a row that carries only limits", () => {
    const state = stateWith({
      assetLimits: true,
      assets: [{ id: "a", ticker: "", allocation: null, minWeight: 5, maxWeight: null }],
    });

    const decoded = decodeFormState(encodeFormState(state, YEAR), YEAR);
    expect(assetsWithoutIds(decoded)).toEqual([
      { ticker: "", allocation: null, minWeight: 5, maxWeight: null },
    ]);
  });

  it("falls back to null for malformed limit values", () => {
    const decoded = decodeFormState(
      new URLSearchParams("assets=AAPL~60~abc~40"),
      YEAR
    );

    expect(assetsWithoutIds(decoded)).toEqual([
      { ticker: "AAPL", allocation: 60, minWeight: null, maxWeight: 40 },
    ]);
  });
});

describe("optimization-url risk-free rate source", () => {
  it("round-trips a reference instrument alongside its rate", () => {
    const state = stateWith({
      strategy: "max-sharpe",
      riskFreeRate: 0.04758,
      riskFreeSource: "us-treasury-10y",
    });

    const decoded = decodeFormState(encodeFormState(state, YEAR), YEAR);

    expect(decoded.riskFreeSource).toBe("us-treasury-10y");
    expect(decoded.riskFreeRate).toBe(0.04758);
  });

  it("omits the source when the rate is typed by hand", () => {
    const state = stateWith({
      strategy: "max-sharpe",
      riskFreeRate: 0.03,
      riskFreeSource: "manual",
    });

    expect(encodeFormState(state, YEAR).has("riskFreeSource")).toBe(false);
  });

  it("drops the source for a strategy that has no risk-free rate", () => {
    const state = stateWith({
      strategy: "min-risk",
      riskFreeSource: "us-treasury-10y",
    });

    expect(encodeFormState(state, YEAR).has("riskFreeSource")).toBe(false);
  });

  it("falls back to manual for an unknown instrument id", () => {
    const decoded = decodeFormState(
      new URLSearchParams("riskFreeSource=mx-cetes-28d"),
      YEAR
    );

    expect(decoded.riskFreeSource).toBe("manual");
  });

  it("defaults a link written before the picker existed to manual", () => {
    const decoded = decodeFormState(new URLSearchParams("riskFreeRate=0.02"), YEAR);

    expect(decoded.riskFreeSource).toBe("manual");
    expect(decoded.riskFreeRate).toBe(0.02);
  });
});

describe("optimization-url strategy parameters", () => {
  it("round-trips the CVaR confidence level", () => {
    const state = stateWith({ strategy: "cvar", cvarConfidence: 0.99 });
    const decoded = decodeFormState(encodeFormState(state, YEAR), YEAR);

    expect(decoded.strategy).toBe("cvar");
    expect(decoded.cvarConfidence).toBe(0.99);
  });

  it("round-trips the Black-Litterman view confidence", () => {
    const state = stateWith({ strategy: "black-litterman", viewConfidence: 0.8 });
    const decoded = decodeFormState(encodeFormState(state, YEAR), YEAR);

    expect(decoded.strategy).toBe("black-litterman");
    expect(decoded.viewConfidence).toBe(0.8);
  });

  it("leaves a strategy's parameters out of the link when it does not use them", () => {
    // Risk parity reads none of the three knobs, so a link to it should carry
    // only the strategy — no stale slider values from an earlier choice.
    const params = encodeFormState(
      stateWith({
        strategy: "risk-parity",
        cvarConfidence: 0.99,
        viewConfidence: 0.8,
        riskFreeRate: 0.07,
      }),
      YEAR
    );

    expect(params.get("strategy")).toBe("risk-parity");
    expect(params.get("cvarConfidence")).toBeNull();
    expect(params.get("viewConfidence")).toBeNull();
    expect(params.get("riskFreeRate")).toBeNull();
  });

  it("still writes the risk-free rate for Black-Litterman", () => {
    const params = encodeFormState(
      stateWith({ strategy: "black-litterman", riskFreeRate: 0.07 }),
      YEAR
    );

    expect(params.get("riskFreeRate")).toBe("0.07");
  });

  it("falls back to the defaults for a link written before these knobs existed", () => {
    const decoded = decodeFormState(new URLSearchParams("strategy=cvar"), YEAR);
    const defaults = defaultFormState(YEAR);

    expect(decoded.cvarConfidence).toBe(defaults.cvarConfidence);
    expect(decoded.viewConfidence).toBe(defaults.viewConfidence);
  });

  it("accepts every strategy the picker offers", () => {
    OPTIMIZATION_STRATEGIES.forEach(({ value }) => {
      const decoded = decodeFormState(
        encodeFormState(stateWith({ strategy: value }), YEAR),
        YEAR
      );
      expect(decoded.strategy).toBe(value);
    });
  });
});

describe("strategyUsesParam", () => {
  it("reports the inputs each strategy reads", () => {
    expect(strategyUsesParam("max-sharpe", "risk-free-rate")).toBe(true);
    expect(strategyUsesParam("black-litterman", "risk-free-rate")).toBe(true);
    expect(strategyUsesParam("black-litterman", "view-confidence")).toBe(true);
    expect(strategyUsesParam("cvar", "cvar-confidence")).toBe(true);
    expect(strategyUsesParam("target-return", "target-return")).toBe(true);
    expect(strategyUsesParam("target-risk", "target-risk")).toBe(true);
  });

  it("reports the risk-based allocators as needing nothing", () => {
    (["risk-parity", "hrp", "max-diversification", "equal-weight"] as const).forEach(
      (strategy) => {
        expect(strategyUsesParam(strategy, "risk-free-rate")).toBe(false);
        expect(strategyUsesParam(strategy, "target-return")).toBe(false);
        expect(strategyUsesParam(strategy, "cvar-confidence")).toBe(false);
        expect(strategyUsesParam(strategy, "view-confidence")).toBe(false);
      }
    );
  });
});
