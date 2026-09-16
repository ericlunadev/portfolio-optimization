import { describe, expect, it } from "vitest";
import { findBlackLittermanPortfolio } from "./black-litterman.js";
import { findTangencyPortfolio } from "./optimizer.js";
import { buildCovarianceMatrix, portfolioVariance } from "./matrix.js";

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

/** How far apart two portfolios are, as the largest single-weight gap. */
function distance(a: number[], b: number[]): number {
  return Math.max(...a.map((w, i) => Math.abs(w - b[i])));
}

describe("findBlackLittermanPortfolio", () => {
  it("collapses to the equilibrium prior when the views are not trusted", () => {
    // With an equal-weight prior, the implied returns are `delta * COV * w_eq`,
    // and the tangency portfolio of those returns is the prior itself — so no
    // confidence in the views means no departure from equal weight.
    const result = findBlackLittermanPortfolio(EXPECTED_RETURNS, COV, {
      viewConfidence: 0,
    });

    // Confidence is clamped just above zero, so a sliver of the views survives.
    result.weights.forEach((w) => expect(w).toBeCloseTo(1 / 3, 1));
  });

  it("converges on the plain historical optimum when the views are trusted outright", () => {
    const blended = findBlackLittermanPortfolio(EXPECTED_RETURNS, COV, {
      viewConfidence: 1,
    });
    const historical = findTangencyPortfolio(EXPECTED_RETURNS, COV);

    expect(distance(blended.weights, historical.weights)).toBeLessThan(0.01);
  });

  it("moves further from the prior the more the views are trusted", () => {
    const prior = Array(3).fill(1 / 3);
    const distances = [0.1, 0.3, 0.6, 0.9].map((viewConfidence) =>
      distance(
        findBlackLittermanPortfolio(EXPECTED_RETURNS, COV, { viewConfidence }).weights,
        prior
      )
    );

    for (let i = 1; i < distances.length; i++) {
      // Only weakly increasing: once a position reaches a bound, more
      // confidence in the views cannot push it any further.
      expect(distances[i]).toBeGreaterThanOrEqual(distances[i - 1] - TOL);
    }
    expect(distances[distances.length - 1]).toBeGreaterThan(distances[0]);
  });

  it("lands between the prior and the historical optimum at middling confidence", () => {
    const prior = Array(3).fill(1 / 3);
    const historical = findTangencyPortfolio(EXPECTED_RETURNS, COV).weights;
    const blended = findBlackLittermanPortfolio(EXPECTED_RETURNS, COV, {
      viewConfidence: 0.5,
    }).weights;

    // Every position lands strictly inside the interval its two endpoints span
    // — the blend leans on the views without ever being decided by them.
    blended.forEach((w, i) => {
      const low = Math.min(prior[i], historical[i]);
      const high = Math.max(prior[i], historical[i]);
      expect(w).toBeGreaterThan(low);
      expect(w).toBeLessThan(high);
    });
  });

  it("reports the return and volatility of the historical estimates", () => {
    // The blended returns pick the weights, but the numbers shown to the user
    // have to match the per-asset returns in the results table.
    const result = findBlackLittermanPortfolio(EXPECTED_RETURNS, COV);

    const expectedReturn = result.weights.reduce(
      (acc, w, i) => acc + w * EXPECTED_RETURNS[i],
      0
    );
    expect(result.return).toBeCloseTo(expectedReturn, 9);
    expect(result.volatility).toBeCloseTo(
      Math.sqrt(portfolioVariance(result.weights, COV)),
      9
    );
  });

  it("stays inside per-asset bounds", () => {
    const result = findBlackLittermanPortfolio(EXPECTED_RETURNS, COV, {
      wMinPerAsset: [0.1, null, null],
      wMaxPerAsset: [null, 0.4, 0.25],
    });

    expect(result.weights[0]).toBeGreaterThanOrEqual(0.1 - TOL);
    expect(result.weights[1]).toBeLessThanOrEqual(0.4 + TOL);
    expect(result.weights[2]).toBeLessThanOrEqual(0.25 + TOL);
    expect(total(result.weights)).toBeCloseTo(1, 6);
  });

  it("anchors the prior on the bounded portfolio, not on raw 1/N", () => {
    // Capping the third asset at 10% has to move the equilibrium prior too,
    // otherwise a bound the user set would be argued against by the anchor.
    const result = findBlackLittermanPortfolio(EXPECTED_RETURNS, COV, {
      viewConfidence: 0,
      wMaxPerAsset: [null, null, 0.1],
    });

    expect(result.weights[2]).toBeCloseTo(0.1, 3);
    expect(result.weights[0]).toBeCloseTo(0.45, 1);
    expect(result.weights[1]).toBeCloseTo(0.45, 1);
  });
});
