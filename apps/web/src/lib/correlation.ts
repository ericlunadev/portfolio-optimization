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
