import { describe, expect, it } from "vitest";
import {
  decodeFormState,
  defaultFormState,
  encodeFormState,
  OptimizationFormState,
} from "./optimization-url";

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
