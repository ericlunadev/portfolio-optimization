import { describe, expect, it } from "vitest";
import {
  MissingStrategyTargetError,
  requiredTargetField,
  runStrategy,
  type StrategyInput,
} from "./run-strategy.js";
import { OPTIMIZATION_STRATEGIES } from "./strategies.js";
import { buildCovarianceMatrix } from "./matrix.js";

const EXPECTED_RETURNS = [0.04, 0.09, 0.16];
const VOLATILITIES = [0.06, 0.14, 0.3];
const CORRELATIONS = [
  [1.0, 0.2, 0.1],
  [0.2, 1.0, 0.4],
  [0.1, 0.4, 1.0],
];
const COV = buildCovarianceMatrix(VOLATILITIES, CORRELATIONS);

const TOL = 1e-6;

/**
 * A short, deterministic return history whose annualized moments are roughly
 * the fixture above — enough for CVaR to have a tail to work with.
 */
function dailyReturns(): number[][] {
  let seed = 7;
  const next = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648 - 0.5;
  };
  return VOLATILITIES.map((vol, i) =>
    Array.from({ length: 400 }, () => EXPECTED_RETURNS[i] / 252 + (vol / 16) * next())
  );
}

function inputFor(strategy: StrategyInput["strategy"]): StrategyInput {
  return {
    strategy,
    expectedReturns: EXPECTED_RETURNS,
    covMatrix: COV,
    dailyReturns: dailyReturns(),
    constraints: { wMax: 1, maxLeverage: 1 },
    riskFreeRate: 0.02,
    targetReturn: 0.1,
    targetRisk: 0.15,
    cvarConfidence: 0.95,
    viewConfidence: 0.5,
  };
}

describe("runStrategy", () => {
  it.each(OPTIMIZATION_STRATEGIES)(
    "returns a fully invested, long-only portfolio for %s",
    (strategy) => {
      const result = runStrategy(inputFor(strategy));

      expect(result.weights).toHaveLength(EXPECTED_RETURNS.length);
      result.weights.forEach((w) => {
        expect(Number.isFinite(w)).toBe(true);
        expect(w).toBeGreaterThanOrEqual(-TOL);
        expect(w).toBeLessThanOrEqual(1 + TOL);
      });
      expect(result.weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
      expect(result.success).toBe(true);
    }
  );

  it.each(OPTIMIZATION_STRATEGIES)(
    "reports the return and volatility its own weights imply for %s",
    (strategy) => {
      const result = runStrategy(inputFor(strategy));

      const expectedReturn = result.weights.reduce(
        (acc, w, i) => acc + w * EXPECTED_RETURNS[i],
        0
      );
      let variance = 0;
      result.weights.forEach((wi, i) => {
        result.weights.forEach((wj, j) => {
          variance += wi * wj * COV[i][j];
        });
      });

      expect(result.return).toBeCloseTo(expectedReturn, 6);
      expect(result.volatility).toBeCloseTo(Math.sqrt(variance), 6);
    }
  );

  it.each(OPTIMIZATION_STRATEGIES)("honours a per-asset cap for %s", (strategy) => {
    const result = runStrategy({
      ...inputFor(strategy),
      constraints: { wMax: 1, wMaxPerAsset: [null, null, 0.2], maxLeverage: 1 },
      // Reachable while the third asset is capped, so the cap is what binds.
      targetReturn: 0.07,
    });

    expect(result.weights[2]).toBeLessThanOrEqual(0.2 + TOL);
    expect(result.weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });

  it("names the field each strategy cannot run without", () => {
    expect(requiredTargetField("target-return")).toBe("target_return");
    expect(requiredTargetField("target-risk")).toBe("target_risk");
    expect(requiredTargetField("max-sharpe")).toBeNull();
    expect(requiredTargetField("cvar")).toBeNull();
    expect(requiredTargetField("hrp")).toBeNull();
  });

  it("refuses a target strategy with no target rather than guessing one", () => {
    expect(() =>
      runStrategy({ ...inputFor("target-return"), targetReturn: undefined })
    ).toThrow(MissingStrategyTargetError);
    expect(() =>
      runStrategy({ ...inputFor("target-risk"), targetRisk: undefined })
    ).toThrow(MissingStrategyTargetError);
  });

  it("gives the risk-based allocators genuinely different portfolios", () => {
    // They all read the same covariance matrix, so a copy-paste in the dispatch
    // would show up as two strategies agreeing to the last decimal.
    const seen = new Map<string, string>();
    for (const strategy of OPTIMIZATION_STRATEGIES) {
      const key = runStrategy(inputFor(strategy))
        .weights.map((w) => w.toFixed(6))
        .join(",");
      expect(seen.has(key)).toBe(false);
      seen.set(key, strategy);
    }
  });
});
