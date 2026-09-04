import { describe, expect, it } from "vitest";
import {
  calculateEfficientFrontier,
  findKneePointPortfolio,
  findMaxReturnPortfolio,
  findMaxSharpePortfolio,
  findMinVariancePortfolio,
  findTargetReturnPortfolio,
  findTangencyPortfolio,
  findTargetRiskPortfolio,
} from "./optimizer.js";
import { buildCovarianceMatrix } from "./matrix.js";
import {
  checkBoundsFeasibility,
  resolveAssetBounds,
  validateAssetBounds,
} from "./bounds.js";

/**
 * Three assets with clearly different risk/return profiles, so the unbounded
 * optimum is lopsided and any bound we add has visible bite.
 */
const EXPECTED_RETURNS = [0.04, 0.09, 0.16];
const VOLATILITIES = [0.06, 0.14, 0.30];
const CORRELATIONS = [
  [1.0, 0.2, 0.1],
  [0.2, 1.0, 0.4],
  [0.1, 0.4, 1.0],
];
const COV = buildCovarianceMatrix(VOLATILITIES, CORRELATIONS);

const TOL = 1e-6;

function total(weights: number[]): number {
  return weights.reduce((a, b) => a + b, 0);
}

function expectWithinBounds(
  weights: number[],
  lower: (number | null)[],
  upper: (number | null)[]
) {
  weights.forEach((w, i) => {
    const lo = lower[i];
    const hi = upper[i];
    if (lo !== null) expect(w).toBeGreaterThanOrEqual(lo - TOL);
    if (hi !== null) expect(w).toBeLessThanOrEqual(hi + TOL);
  });
}

describe("resolveAssetBounds", () => {
  it("falls back to [0, wMax] for assets without their own bound", () => {
    const bounds = resolveAssetBounds(3, { wMax: 0.5 });
    expect(bounds.lower).toEqual([0, 0, 0]);
    expect(bounds.upper).toEqual([0.5, 0.5, 0.5]);
  });

  it("uses -wMax as the floor when short selling is allowed", () => {
    const bounds = resolveAssetBounds(2, { wMax: 0.4, allowShortSelling: true });
    expect(bounds.lower).toEqual([-0.4, -0.4]);
  });

  it("lets per-asset entries override the fallback, leaving nulls alone", () => {
    const bounds = resolveAssetBounds(3, {
      wMax: 0.5,
      wMinPerAsset: [0.1, null, 0.2],
      wMaxPerAsset: [null, 0.25, 0.8],
    });
    expect(bounds.lower).toEqual([0.1, 0, 0.2]);
    expect(bounds.upper).toEqual([0.5, 0.25, 0.8]);
  });

  it("never returns an empty interval", () => {
    const bounds = resolveAssetBounds(1, { wMax: 0.2, wMinPerAsset: [0.6] });
    expect(bounds.upper[0]).toBeGreaterThanOrEqual(bounds.lower[0]);
  });
});

describe("checkBoundsFeasibility", () => {
  it("accepts bounds that bracket the target", () => {
    const bounds = resolveAssetBounds(3, { wMax: 0.5, wMinPerAsset: [0.1, 0.1, 0.1] });
    expect(checkBoundsFeasibility(bounds, 1.0).feasible).toBe(true);
  });

  it("rejects floors that sum above the target", () => {
    const bounds = resolveAssetBounds(3, { wMinPerAsset: [0.5, 0.5, 0.5] });
    const result = checkBoundsFeasibility(bounds, 1.0);
    expect(result.feasible).toBe(false);
    expect(result.minTotal).toBeCloseTo(1.5, 10);
  });

  it("rejects caps that sum below the target under full investment", () => {
    const bounds = resolveAssetBounds(3, { wMaxPerAsset: [0.2, 0.2, 0.2] });
    expect(checkBoundsFeasibility(bounds, 1.0, true).feasible).toBe(false);
    // Without full investment the portfolio may simply hold cash.
    expect(checkBoundsFeasibility(bounds, 1.0, false).feasible).toBe(true);
  });
});

describe("validateAssetBounds", () => {
  const body = { tickers: ["A", "B", "C"], w_max: 1 };

  it("accepts a request with no bounds at all", () => {
    expect(validateAssetBounds(body)).toBeNull();
  });

  it("accepts satisfiable bounds", () => {
    expect(
      validateAssetBounds({
        ...body,
        w_min_per_asset: [0.1, 0.1, null],
        w_max_per_asset: [0.5, null, 0.6],
      })
    ).toBeNull();
  });

  it("rejects arrays that do not line up with the tickers", () => {
    expect(validateAssetBounds({ ...body, w_min_per_asset: [0.1] })?.error).toBe(
      "bounds_length_mismatch"
    );
  });

  it("rejects a negative floor without short selling", () => {
    expect(
      validateAssetBounds({ ...body, w_min_per_asset: [-0.1, null, null] })?.error
    ).toBe("negative_min_weight");
  });

  it("allows a negative floor with short selling on", () => {
    expect(
      validateAssetBounds({
        ...body,
        allow_short_selling: true,
        w_min_per_asset: [-0.1, null, null],
      })
    ).toBeNull();
  });

  it("rejects a floor above its own cap", () => {
    expect(
      validateAssetBounds({
        ...body,
        w_min_per_asset: [0.6, null, null],
        w_max_per_asset: [0.2, null, null],
      })?.error
    ).toBe("min_above_max");
  });

  it("rejects a floor above the whole portfolio", () => {
    expect(
      validateAssetBounds({ ...body, w_min_per_asset: [1.5, null, null] })?.error
    ).toBe("min_above_total");
  });

  it("rejects floors that sum past the total", () => {
    expect(
      validateAssetBounds({ ...body, w_min_per_asset: [0.5, 0.5, 0.5] })?.error
    ).toBe("min_weights_exceed_total");
  });

  it("rejects caps that sum short of the total", () => {
    expect(
      validateAssetBounds({ ...body, w_max_per_asset: [0.2, 0.2, 0.2] })?.error
    ).toBe("max_weights_below_total");
  });

  it("accepts short caps when the portfolio may hold cash", () => {
    expect(
      validateAssetBounds({
        ...body,
        enforce_full_investment: false,
        w_max_per_asset: [0.2, 0.2, 0.2],
      })
    ).toBeNull();
  });

  it("measures against the leveraged total", () => {
    expect(
      validateAssetBounds({
        ...body,
        max_leverage: 1.5,
        w_min_per_asset: [0.5, 0.5, 0.4],
      })
    ).toBeNull();
  });
});

describe("findMinVariancePortfolio with per-asset bounds", () => {
  it("keeps the unbounded solution fully invested", () => {
    const result = findMinVariancePortfolio(EXPECTED_RETURNS, COV, {
      rMin: 0,
      wMax: 1,
    });
    expect(total(result.weights)).toBeCloseTo(1, 6);
    expectWithinBounds(result.weights, [0, 0, 0], [1, 1, 1]);
  });

  it("honours a floor on the asset the optimizer would otherwise drop", () => {
    const wMinPerAsset = [null, null, 0.25];
    const result = findMinVariancePortfolio(EXPECTED_RETURNS, COV, {
      rMin: 0,
      wMax: 1,
      wMinPerAsset,
    });

    expect(result.weights[2]).toBeGreaterThanOrEqual(0.25 - TOL);
    expect(total(result.weights)).toBeCloseTo(1, 6);
  });

  it("honours a cap on the asset the optimizer would otherwise pile into", () => {
    const wMaxPerAsset = [0.3, null, null];
    const result = findMinVariancePortfolio(EXPECTED_RETURNS, COV, {
      rMin: 0,
      wMax: 1,
      wMaxPerAsset,
    });

    expect(result.weights[0]).toBeLessThanOrEqual(0.3 + TOL);
    expect(total(result.weights)).toBeCloseTo(1, 6);
  });

  it("respects a floor and a cap on every asset at once", () => {
    const wMinPerAsset = [0.2, 0.1, 0.05];
    const wMaxPerAsset = [0.5, 0.4, 0.35];
    const result = findMinVariancePortfolio(EXPECTED_RETURNS, COV, {
      rMin: 0,
      wMax: 1,
      wMinPerAsset,
      wMaxPerAsset,
    });

    expectWithinBounds(result.weights, wMinPerAsset, wMaxPerAsset);
    expect(total(result.weights)).toBeCloseTo(1, 6);
  });

  it("pins the portfolio exactly when the bounds leave a single solution", () => {
    const result = findMinVariancePortfolio(EXPECTED_RETURNS, COV, {
      rMin: 0,
      wMax: 1,
      wMinPerAsset: [0.5, 0.3, 0.2],
      wMaxPerAsset: [0.5, 0.3, 0.2],
    });

    expect(result.weights[0]).toBeCloseTo(0.5, 6);
    expect(result.weights[1]).toBeCloseTo(0.3, 6);
    expect(result.weights[2]).toBeCloseTo(0.2, 6);
  });

  it("keeps bounds while meeting a minimum return", () => {
    const wMinPerAsset = [0.1, 0.1, 0.1];
    const wMaxPerAsset = [0.6, 0.6, 0.6];
    const result = findMinVariancePortfolio(EXPECTED_RETURNS, COV, {
      rMin: 0.10,
      wMax: 1,
      wMinPerAsset,
      wMaxPerAsset,
    });

    expectWithinBounds(result.weights, wMinPerAsset, wMaxPerAsset);
    expect(total(result.weights)).toBeCloseTo(1, 6);
    expect(result.return).toBeGreaterThan(0.09);
  });

  it("allows a negative floor when short selling is on", () => {
    const result = findMinVariancePortfolio(EXPECTED_RETURNS, COV, {
      rMin: 0.12,
      wMax: 1,
      allowShortSelling: true,
      wMinPerAsset: [-0.5, -0.5, 0],
    });

    expect(total(result.weights)).toBeCloseTo(1, 6);
    expectWithinBounds(result.weights, [-0.5, -0.5, 0], [1, 1, 1]);
  });

  it("scales the total to the leverage target", () => {
    const result = findMinVariancePortfolio(EXPECTED_RETURNS, COV, {
      rMin: 0,
      wMax: 1,
      maxLeverage: 1.5,
      wMinPerAsset: [0.2, null, null],
    });

    expect(total(result.weights)).toBeCloseTo(1.5, 6);
    expect(result.weights[0]).toBeGreaterThanOrEqual(0.2 - TOL);
  });

  it("invests everything the caps allow rather than collapsing to cash", () => {
    // Long-only minimum variance would otherwise take the trivial zero
    // portfolio, so the total is pinned to whatever the caps can hold.
    const result = findMinVariancePortfolio(EXPECTED_RETURNS, COV, {
      rMin: 0,
      wMax: 1,
      enforceFullInvestment: false,
      wMaxPerAsset: [0.2, 0.2, 0.2],
    });

    expect(total(result.weights)).toBeCloseTo(0.6, 6);
    expectWithinBounds(result.weights, [0, 0, 0], [0.2, 0.2, 0.2]);
  });

  it("lets a short-selling portfolio sit below the target", () => {
    const result = findMinVariancePortfolio(EXPECTED_RETURNS, COV, {
      rMin: 0,
      wMax: 1,
      allowShortSelling: true,
      enforceFullInvestment: false,
      wMaxPerAsset: [0.2, 0.2, 0.2],
    });

    expect(total(result.weights)).toBeLessThanOrEqual(0.6 + TOL);
  });

  it("never lets net exposure go short when cash is allowed", () => {
    // Without a floor on the total, the shorts run away to their bounds and
    // the "portfolio" ends up net short of its entire capital.
    const result = findMinVariancePortfolio(EXPECTED_RETURNS, COV, {
      rMin: 0.14,
      wMax: 1,
      allowShortSelling: true,
      enforceFullInvestment: false,
    });

    expect(total(result.weights)).toBeGreaterThanOrEqual(-TOL);
    expect(total(result.weights)).toBeLessThanOrEqual(1 + TOL);
  });
});

describe("bounds across every strategy", () => {
  const wMinPerAsset = [0.15, 0.1, 0.05];
  const wMaxPerAsset = [0.5, 0.45, 0.4];
  const options = { wMax: 1, wMinPerAsset, wMaxPerAsset };

  it("max-sharpe stays inside the bounds", () => {
    const result = findMaxSharpePortfolio(EXPECTED_RETURNS, COV, {
      ...options,
      riskFreeRate: 0.02,
      numFrontierPoints: 25,
    });
    expectWithinBounds(result.weights, wMinPerAsset, wMaxPerAsset);
    expect(total(result.weights)).toBeCloseTo(1, 6);
  });

  it("max-return fills the highest-return asset up to its cap", () => {
    const result = findMaxReturnPortfolio(EXPECTED_RETURNS, COV, options);
    expectWithinBounds(result.weights, wMinPerAsset, wMaxPerAsset);
    expect(total(result.weights)).toBeCloseTo(1, 6);
    expect(result.weights[2]).toBeCloseTo(0.4, 6);
  });

  it("max-return without bounds still concentrates in the best asset", () => {
    const result = findMaxReturnPortfolio(EXPECTED_RETURNS, COV, { wMax: 1 });
    expect(result.weights[2]).toBeCloseTo(1, 6);
    expect(result.return).toBeCloseTo(0.16, 6);
  });

  it("target-return stays inside the bounds", () => {
    const result = findTargetReturnPortfolio(EXPECTED_RETURNS, COV, 0.11, options);
    expectWithinBounds(result.weights, wMinPerAsset, wMaxPerAsset);
    expect(total(result.weights)).toBeCloseTo(1, 6);
  });

  it("target-risk stays inside the bounds", () => {
    const result = findTargetRiskPortfolio(EXPECTED_RETURNS, COV, 0.12, {
      ...options,
      numFrontierPoints: 25,
    });
    expectWithinBounds(result.weights, wMinPerAsset, wMaxPerAsset);
    expect(total(result.weights)).toBeCloseTo(1, 6);
  });

  it("knee-point stays inside the bounds", () => {
    const result = findKneePointPortfolio(EXPECTED_RETURNS, COV, {
      ...options,
      numFrontierPoints: 25,
    });
    expectWithinBounds(result.weights, wMinPerAsset, wMaxPerAsset);
    expect(total(result.weights)).toBeCloseTo(1, 6);
  });

  it("every efficient frontier point stays inside the bounds", () => {
    const frontier = calculateEfficientFrontier(EXPECTED_RETURNS, COV, 15, 1, options);
    frontier.weights.forEach((weights) => {
      expectWithinBounds(weights, wMinPerAsset, wMaxPerAsset);
      expect(total(weights)).toBeCloseTo(1, 6);
    });
  });
});

describe("findTangencyPortfolio", () => {
  /** Sharpe ratio of a portfolio, measured straight from the definition. */
  function sharpe(weights: number[], riskFreeRate = 0): number {
    let variance = 0;
    for (let i = 0; i < weights.length; i++) {
      for (let j = 0; j < weights.length; j++) {
        variance += weights[i] * weights[j] * COV[i][j];
      }
    }
    const excess = weights.reduce(
      (acc, w, i) => acc + w * (EXPECTED_RETURNS[i] - riskFreeRate),
      0
    );
    return excess / Math.sqrt(variance);
  }

  it("finds a higher Sharpe ratio than the sampled frontier does", () => {
    const exact = findTangencyPortfolio(EXPECTED_RETURNS, COV);
    const sampled = findMaxSharpePortfolio(EXPECTED_RETURNS, COV, {
      numFrontierPoints: 200,
    });
    expect(sharpe(exact.weights)).toBeGreaterThan(sharpe(sampled.weights));
  });

  it("beats every neighbouring portfolio on a fine grid", () => {
    const result = findTangencyPortfolio(EXPECTED_RETURNS, COV);
    const best = sharpe(result.weights);

    for (let a = 0; a <= 1.0000001; a += 0.01) {
      for (let b = 0; a + b <= 1.0000001; b += 0.01) {
        expect(sharpe([a, b, 1 - a - b])).toBeLessThanOrEqual(best + 1e-9);
      }
    }
  });

  it("reproduces the reported Sharpe ratio", () => {
    const result = findTangencyPortfolio(EXPECTED_RETURNS, COV, {
      riskFreeRate: 0.02,
    });
    expect(result.sharpeRatio).toBeCloseTo(sharpe(result.weights, 0.02), 9);
    expect(total(result.weights)).toBeCloseTo(1, 6);
  });

  it("stays inside per-asset bounds", () => {
    const result = findTangencyPortfolio(EXPECTED_RETURNS, COV, {
      wMinPerAsset: [null, 0.2, null],
      wMaxPerAsset: [0.5, null, 0.3],
    });
    expectWithinBounds(result.weights, [null, 0.2, null], [0.5, null, 0.3]);
    expect(total(result.weights)).toBeCloseTo(1, 6);
  });

  it("falls back to the even split when the covariance matrix is singular", () => {
    const singular = [
      [0.04, 0.04],
      [0.04, 0.04],
    ];
    const result = findTangencyPortfolio([0.1, 0.1], singular);
    expect(total(result.weights)).toBeCloseTo(1, 6);
    result.weights.forEach((w) => expect(Number.isFinite(w)).toBe(true));
  });
});
