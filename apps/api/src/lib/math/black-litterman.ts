import { Matrix, inverse } from "ml-matrix";
import { describePortfolio } from "./allocators.js";
import { projectOntoBounded, resolveAssetBounds } from "./bounds.js";
import {
  ConstraintOptions,
  OptimizationResult,
  findTangencyPortfolio,
} from "./optimizer.js";

/**
 * Black-Litterman: blend the returns the market already implies with the
 * returns the price history suggests.
 *
 * Plain mean-variance optimization takes historical averages at face value, and
 * those averages are noisy enough that the optimizer piles into whichever asset
 * got lucky. Black and Litterman start from the opposite end: assume the market
 * portfolio is correctly priced, work backwards to the returns that would make
 * it optimal, and treat anything else as a *view* that has to argue its way in
 * against that anchor. The result degrades gracefully — a weak view barely
 * moves the portfolio, instead of dominating it.
 *
 * Two knobs control the blend, and only the second is worth exposing:
 *
 * - `riskAversion` scales the equilibrium returns. 2.5 is the conventional
 *   estimate for a broad equity market and is not worth a slider.
 * - `viewConfidence` is how much the caller trusts the historical estimates
 *   over the equilibrium anchor. At 0 the portfolio is pure equilibrium; at 1
 *   the views win outright and the result converges on plain max-Sharpe.
 */

/** Uncertainty in the equilibrium prior, as a fraction of the covariance. */
const TAU = 0.05;

/** Conventional risk aversion for a broad equity market. */
const DEFAULT_RISK_AVERSION = 2.5;

export interface BlackLittermanOptions extends ConstraintOptions {
  riskFreeRate?: number;
  /** Trust in the historical views versus the equilibrium prior, 0 to 1. */
  viewConfidence?: number;
  riskAversion?: number;
}

export function findBlackLittermanPortfolio(
  expectedReturns: number[],
  covMatrix: number[][],
  options: BlackLittermanOptions = {}
): OptimizationResult {
  const {
    riskFreeRate = 0,
    viewConfidence = 0.5,
    riskAversion = DEFAULT_RISK_AVERSION,
    ...constraints
  } = options;

  const posterior = blendedReturns(expectedReturns, covMatrix, {
    riskFreeRate,
    viewConfidence,
    riskAversion,
    ...constraints,
  });

  const optimal = findTangencyPortfolio(posterior, covMatrix, {
    ...constraints,
    riskFreeRate,
  });

  // The blended returns choose the weights, but the reported return and
  // volatility come from the historical estimates — the same basis every other
  // strategy reports on, and the same numbers the per-asset table shows.
  return describePortfolio(optimal.weights, expectedReturns, covMatrix);
}

/**
 * The Black-Litterman posterior mean.
 *
 * With one view per asset the view matrix `P` is the identity, which collapses
 * the general formula to
 *
 *   `mu = PI + tau*COV * (tau*COV + OMEGA)^-1 * (Q - PI)`
 *
 * where `PI` is the equilibrium excess return, `Q` the historical excess return
 * and `OMEGA` the uncertainty attached to the views.
 */
function blendedReturns(
  expectedReturns: number[],
  covMatrix: number[][],
  options: BlackLittermanOptions
): number[] {
  const { riskFreeRate = 0, riskAversion = DEFAULT_RISK_AVERSION } = options;

  // Confidence is clamped away from both ends: at exactly 1 the view
  // uncertainty vanishes and the blend divides by a possibly singular matrix,
  // and at exactly 0 it is infinite.
  const confidence = Math.min(0.99, Math.max(0.01, options.viewConfidence ?? 0.5));

  const equilibrium = equilibriumReturns(covMatrix, riskAversion, options);
  const views = expectedReturns.map((r) => r - riskFreeRate);

  const scaledCov = new Matrix(covMatrix).mul(TAU);

  // Views are independent of each other, so OMEGA is diagonal: each view's
  // uncertainty scales with that asset's own variance, then with how little the
  // caller trusts the views.
  const trustPenalty = (1 - confidence) / confidence;
  const omega = Matrix.diag(covMatrix.map((row, i) => TAU * row[i] * trustPenalty));

  // `add` mutates its receiver in ml-matrix, so the sum is built on a clone —
  // otherwise `scaledCov` becomes the sum and the gain collapses to the
  // identity, silently ignoring the prior.
  const gain = scaledCov.mmul(inverse(scaledCov.clone().add(omega)));
  const surprise = Matrix.columnVector(views.map((q, i) => q - equilibrium[i]));
  const adjustment = gain.mmul(surprise);

  return equilibrium.map((pi, i) => pi + adjustment.get(i, 0) + riskFreeRate);
}

/**
 * Reverse-optimize the excess returns that would make the prior portfolio
 * optimal: `PI = riskAversion * COV * w`.
 *
 * The prior should be the market-cap portfolio, but the app optimizes arbitrary
 * ticker baskets with no cap data attached, so it uses the equal-weight
 * portfolio — the neutral choice when nothing distinguishes the assets. It is
 * put through the same bounds as the final portfolio, so an asset the caller
 * capped at 5% does not anchor the prior at 1/N.
 */
function equilibriumReturns(
  covMatrix: number[][],
  riskAversion: number,
  options: ConstraintOptions
): number[] {
  const n = covMatrix.length;
  const bounds = resolveAssetBounds(n, options);
  const prior = projectOntoBounded(Array(n).fill(1 / n), 1, bounds, true);

  return covMatrix.map(
    (row) => riskAversion * row.reduce((acc, cov, j) => acc + cov * prior[j], 0)
  );
}
