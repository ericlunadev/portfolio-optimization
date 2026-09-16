import { describe, expect, it } from "vitest";
import {
  findEqualWeightPortfolio,
  findHierarchicalRiskParityPortfolio,
  findMaxDiversificationPortfolio,
  findMinCVaRPortfolio,
  findRiskParityPortfolio,
} from "./allocators.js";
import { buildCovarianceMatrix, dot, portfolioVariance } from "./matrix.js";

/**
 * Three assets with clearly different risk/return profiles, matching the
 * fixture the mean-variance tests use, so results are comparable across files.
 */
const EXPECTED_RETURNS = [0.04, 0.09, 0.16];
const VOLATILITIES = [0.06, 0.14, 0.3];
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

/** Share of portfolio variance attributable to each asset. */
function riskContributions(weights: number[], covMatrix: number[][]): number[] {
  return weights.map((w, i) => w * dot(covMatrix[i], weights));
}

function diversificationRatio(weights: number[]): number {
  return dot(weights, VOLATILITIES) / Math.sqrt(portfolioVariance(weights, COV));
}

describe("findEqualWeightPortfolio", () => {
  it("splits capital evenly when nothing constrains it", () => {
    const result = findEqualWeightPortfolio(EXPECTED_RETURNS, COV);
    result.weights.forEach((w) => expect(w).toBeCloseTo(1 / 3, 9));
    expect(total(result.weights)).toBeCloseTo(1, 9);
  });

  it("reports the return and volatility the even split implies", () => {
    const result = findEqualWeightPortfolio(EXPECTED_RETURNS, COV);
    expect(result.return).toBeCloseTo((0.04 + 0.09 + 0.16) / 3, 9);
    expect(result.volatility).toBeCloseTo(
      Math.sqrt(portfolioVariance([1 / 3, 1 / 3, 1 / 3], COV)),
      9
    );
  });

  it("redistributes to the other assets when one is capped below 1/N", () => {
    const result = findEqualWeightPortfolio(EXPECTED_RETURNS, COV, {
      wMaxPerAsset: [null, null, 0.1],
    });
    expect(result.weights[2]).toBeCloseTo(0.1, 6);
    expect(result.weights[0]).toBeCloseTo(0.45, 6);
    expect(result.weights[1]).toBeCloseTo(0.45, 6);
    expect(total(result.weights)).toBeCloseTo(1, 6);
  });

  it("scales up to the leverage target", () => {
    const result = findEqualWeightPortfolio(EXPECTED_RETURNS, COV, { maxLeverage: 2 });
    expect(total(result.weights)).toBeCloseTo(2, 6);
  });
});

describe("findRiskParityPortfolio", () => {
  it("gives every asset the same share of portfolio risk", () => {
    const result = findRiskParityPortfolio(EXPECTED_RETURNS, COV);
    const contributions = riskContributions(result.weights, COV);
    const expected = contributions[0];

    contributions.forEach((rc) => expect(rc / expected).toBeCloseTo(1, 6));
    expect(total(result.weights)).toBeCloseTo(1, 6);
  });

  it("holds less of the more volatile asset", () => {
    const result = findRiskParityPortfolio(EXPECTED_RETURNS, COV);
    expect(result.weights[0]).toBeGreaterThan(result.weights[1]);
    expect(result.weights[1]).toBeGreaterThan(result.weights[2]);
  });

  it("sits between equal weight and minimum variance on risk", () => {
    const parity = findRiskParityPortfolio(EXPECTED_RETURNS, COV);
    const equal = findEqualWeightPortfolio(EXPECTED_RETURNS, COV);
    expect(parity.volatility).toBeLessThan(equal.volatility);
  });

  it("stays inside per-asset bounds", () => {
    const result = findRiskParityPortfolio(EXPECTED_RETURNS, COV, {
      wMinPerAsset: [0.1, 0.1, 0.1],
      wMaxPerAsset: [0.5, 0.5, 0.5],
    });
    result.weights.forEach((w) => {
      expect(w).toBeGreaterThanOrEqual(0.1 - TOL);
      expect(w).toBeLessThanOrEqual(0.5 + TOL);
    });
    expect(total(result.weights)).toBeCloseTo(1, 6);
  });

  it("survives two perfectly correlated assets", () => {
    const cov = buildCovarianceMatrix(
      [0.2, 0.2],
      [
        [1, 1],
        [1, 1],
      ]
    );
    const result = findRiskParityPortfolio([0.1, 0.1], cov);
    expect(result.weights[0]).toBeCloseTo(0.5, 4);
    expect(result.weights[1]).toBeCloseTo(0.5, 4);
  });
});

describe("findMaxDiversificationPortfolio", () => {
  it("diversifies better than the even split", () => {
    const result = findMaxDiversificationPortfolio(EXPECTED_RETURNS, COV);
    expect(diversificationRatio(result.weights)).toBeGreaterThan(
      diversificationRatio([1 / 3, 1 / 3, 1 / 3])
    );
    expect(total(result.weights)).toBeCloseTo(1, 6);
  });

  it("splits a pair of identical, uncorrelated assets evenly", () => {
    const cov = buildCovarianceMatrix(
      [0.2, 0.2],
      [
        [1, 0],
        [0, 1],
      ]
    );
    const result = findMaxDiversificationPortfolio([0.1, 0.1], cov);
    expect(result.weights[0]).toBeCloseTo(0.5, 4);
    expect(result.weights[1]).toBeCloseTo(0.5, 4);
  });

  it("weights uncorrelated assets by the inverse of their volatility", () => {
    // With zero correlation the diversification ratio is maximized when every
    // asset contributes the same amount of volatility, so w is proportional to
    // 1/vol: vols of 5/10/20% give weights in a 4:2:1 ratio.
    const vols = [0.05, 0.1, 0.2];
    const cov = buildCovarianceMatrix(vols, [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
    const result = findMaxDiversificationPortfolio([0.1, 0.1, 0.1], cov);

    expect(result.weights[0]).toBeCloseTo(4 / 7, 4);
    expect(result.weights[1]).toBeCloseTo(2 / 7, 4);
    expect(result.weights[2]).toBeCloseTo(1 / 7, 4);
  });

  it("stays inside per-asset bounds", () => {
    const result = findMaxDiversificationPortfolio(EXPECTED_RETURNS, COV, {
      wMaxPerAsset: [0.4, 0.4, 0.4],
    });
    result.weights.forEach((w) => {
      expect(w).toBeGreaterThanOrEqual(-TOL);
      expect(w).toBeLessThanOrEqual(0.4 + TOL);
    });
    expect(total(result.weights)).toBeCloseTo(1, 6);
  });
});

describe("findHierarchicalRiskParityPortfolio", () => {
  it("produces a long-only portfolio that is fully invested", () => {
    const result = findHierarchicalRiskParityPortfolio(EXPECTED_RETURNS, COV);
    result.weights.forEach((w) => expect(w).toBeGreaterThanOrEqual(-TOL));
    expect(total(result.weights)).toBeCloseTo(1, 6);
  });

  it("holds less of the more volatile asset", () => {
    const result = findHierarchicalRiskParityPortfolio(EXPECTED_RETURNS, COV);
    expect(result.weights[0]).toBeGreaterThan(result.weights[2]);
  });

  it("splits capital across clusters, not across assets", () => {
    // Three near-identical tech names and one lone bond. Equal weight would put
    // 75% in tech; clustering should recognize the tech names as one bet.
    const cov = buildCovarianceMatrix(
      [0.25, 0.25, 0.25, 0.05],
      [
        [1, 0.95, 0.95, 0],
        [0.95, 1, 0.95, 0],
        [0.95, 0.95, 1, 0],
        [0, 0, 0, 1],
      ]
    );
    const result = findHierarchicalRiskParityPortfolio([0.1, 0.1, 0.1, 0.03], cov);
    const tech = result.weights[0] + result.weights[1] + result.weights[2];
    expect(result.weights[3]).toBeGreaterThan(tech);
  });

  it("puts everything in the only asset there is", () => {
    const result = findHierarchicalRiskParityPortfolio([0.1], [[0.04]]);
    expect(result.weights).toEqual([1]);
  });

  it("stays inside per-asset bounds", () => {
    const result = findHierarchicalRiskParityPortfolio(EXPECTED_RETURNS, COV, {
      wMaxPerAsset: [0.5, null, null],
    });
    expect(result.weights[0]).toBeLessThanOrEqual(0.5 + TOL);
    expect(total(result.weights)).toBeCloseTo(1, 6);
  });
});

/**
 * Deterministic pseudo-random draws, so the CVaR scenarios are the same on
 * every run without pulling in a seeded-random dependency.
 */
function scenarios(): number[][] {
  let seed = 42;
  const next = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  // Box-Muller, reused for both assets so the shapes are comparable.
  const normal = () => {
    const u = Math.max(1e-12, next());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
  };

  const periods = 500;
  const steady: number[] = [];
  const crashy: number[] = [];

  for (let t = 0; t < periods; t++) {
    steady.push(0.0004 + 0.01 * normal());
    // Same day-to-day volatility, but every 50th day it drops 12%.
    crashy.push(0.0004 + 0.01 * normal() - (t % 50 === 0 ? 0.12 : 0));
  }

  return [steady, crashy];
}

/**
 * The empirical CVaR of a two-asset portfolio, computed the way the paper
 * defines it: average the losses beyond the confidence quantile.
 */
function empiricalCVaR(draws: number[][], w0: number, confidence: number): number {
  const losses = draws[0].map((_, t) => -(w0 * draws[0][t] + (1 - w0) * draws[1][t]));
  const sorted = [...losses].sort((a, b) => a - b);
  const tail = sorted.slice(Math.ceil(confidence * sorted.length));
  return tail.reduce((a, b) => a + b, 0) / tail.length;
}

/** Scan the whole feasible line for the weight with the lowest CVaR. */
function bruteForceWeight(draws: number[][], confidence: number): number {
  let best = Infinity;
  let bestW = 0;
  for (let w0 = 0; w0 <= 1.0000001; w0 += 0.001) {
    const cvar = empiricalCVaR(draws, w0, confidence);
    if (cvar < best) {
      best = cvar;
      bestW = w0;
    }
  }
  return bestW;
}

describe("findMinCVaRPortfolio", () => {
  const returns = [0.1, 0.1];
  const cov = buildCovarianceMatrix(
    [0.16, 0.16],
    [
      [1, 0],
      [0, 1],
    ]
  );

  it("avoids the asset that crashes, even at matching volatility", () => {
    const result = findMinCVaRPortfolio(scenarios(), returns, cov);
    expect(result.weights[0]).toBeGreaterThan(0.8);
    expect(total(result.weights)).toBeCloseTo(1, 6);
  });

  it("beats the even split on tail loss", () => {
    const draws = scenarios();
    const result = findMinCVaRPortfolio(draws, returns, cov);

    const tailLoss = (weights: number[]) => {
      const losses = draws[0].map(
        (_, t) => -(weights[0] * draws[0][t] + weights[1] * draws[1][t])
      );
      const sorted = [...losses].sort((a, b) => a - b);
      const worst = sorted.slice(Math.floor(0.95 * sorted.length));
      return worst.reduce((a, b) => a + b, 0) / worst.length;
    };

    expect(tailLoss(result.weights)).toBeLessThan(tailLoss([0.5, 0.5]));
  });

  it("respects a cap that forces it to hold the crashing asset", () => {
    const result = findMinCVaRPortfolio(scenarios(), returns, cov, {
      wMaxPerAsset: [0.6, null],
    });
    expect(result.weights[0]).toBeCloseTo(0.6, 4);
    expect(result.weights[1]).toBeCloseTo(0.4, 4);
  });

  it("falls back to equal weight when there is no return history", () => {
    const result = findMinCVaRPortfolio([[], []], returns, cov);
    expect(result.weights[0]).toBeCloseTo(0.5, 9);
    expect(result.weights[1]).toBeCloseTo(0.5, 9);
  });

  it.each([0.9, 0.95, 0.99])(
    "lands on the brute-force optimum at %s confidence",
    (confidence) => {
      const draws = scenarios();
      const result = findMinCVaRPortfolio(draws, returns, cov, { confidence });
      expect(result.weights[0]).toBeCloseTo(bruteForceWeight(draws, confidence), 2);
    }
  );
});
