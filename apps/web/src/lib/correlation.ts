/**
 * The API returns covariances only. Correlation is the same information
 * normalized by each pair's volatilities, so the report derives it here instead
 * of widening the response — which also means simulations saved before a
 * correlation field would have existed still show the matrix.
 */
export function correlationFromCovariance(covariance: number[][]): number[][] {
  const deviations = covariance.map((row, i) => Math.sqrt(Math.max(row[i], 0)));

  return covariance.map((row, i) =>
    row.map((value, j) => {
      const denominator = deviations[i] * deviations[j];
      // An asset with no variance at all has no correlation to report.
      if (denominator === 0) return 0;
      // Rounding can push an entry a hair past the [-1, 1] range.
      return Math.max(-1, Math.min(1, value / denominator));
    })
  );
}

export type DiversificationLevel = "high" | "moderate" | "low";

/** Below this average correlation the assets genuinely offset each other. */
const WELL_DIVERSIFIED_BELOW = 0.3;
/** At or above this they mostly move as one, and the mix adds little. */
const POORLY_DIVERSIFIED_FROM = 0.6;

export interface DiversificationSummary {
  /** Average correlation across pairs, each pair weighted by |w_i|·|w_j|. */
  averageCorrelation: number;
  level: DiversificationLevel;
}

/**
 * One number for "is this portfolio diversified?": the average off-diagonal
 * correlation, with each pair counted by how much of the portfolio it holds
 * (|w_i|·|w_j|). A 0.95 correlation between two assets at 1% each says nothing
 * about a portfolio that is 90% in a third one, so an unweighted average would
 * mislead. Absolute weights keep a short leg counting as exposure rather than
 * cancelling a long one.
 *
 * Returns null when there is no pair to average — a single asset, or every
 * weight but one at zero.
 */
export function summarizeDiversification(
  correlation: number[][],
  weights: number[]
): DiversificationSummary | null {
  let weightedSum = 0;
  let totalWeight = 0;

  for (let i = 0; i < correlation.length; i++) {
    for (let j = i + 1; j < correlation.length; j++) {
      const pairWeight = Math.abs(weights[i] ?? 0) * Math.abs(weights[j] ?? 0);
      weightedSum += pairWeight * correlation[i][j];
      totalWeight += pairWeight;
    }
  }

  // Weights below this are solver noise, not a position worth a pair.
  if (totalWeight < 1e-12) return null;

  const averageCorrelation = weightedSum / totalWeight;
  const level: DiversificationLevel =
    averageCorrelation < WELL_DIVERSIFIED_BELOW
      ? "high"
      : averageCorrelation < POORLY_DIVERSIFIED_FROM
        ? "moderate"
        : "low";

  return { averageCorrelation, level };
}
