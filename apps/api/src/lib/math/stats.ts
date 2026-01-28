/**
 * Calculate mean of an array
 */
export function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * Calculate standard deviation of an array
 */
export function stdDev(arr: number[]): number {
  if (arr.length === 0) return 0;
  const m = mean(arr);
  const variance = arr.reduce((sum, x) => sum + Math.pow(x - m, 2), 0) / arr.length;
  return Math.sqrt(variance);
}

/**
 * Calculate correlation coefficient between two arrays
 */
export function correlation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length === 0) return 0;

  const n = x.length;
  const meanX = mean(x);
  const meanY = mean(y);
  const stdX = stdDev(x);
  const stdY = stdDev(y);

  if (stdX === 0 || stdY === 0) return 0;

  let covariance = 0;
  for (let i = 0; i < n; i++) {
    covariance += (x[i] - meanX) * (y[i] - meanY);
  }
  covariance /= n;

  return covariance / (stdX * stdY);
}

/**
 * Calculate correlation matrix from returns matrix
 * Each row is a different asset, each column is a time period
 */
export function correlationMatrix(returns: number[][]): number[][] {
  const n = returns.length;
  const matrix: number[][] = Array(n)
    .fill(null)
    .map(() => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        matrix[i][j] = 1;
      } else if (i < j) {
        const corr = correlation(returns[i], returns[j]);
        matrix[i][j] = corr;
        matrix[j][i] = corr;
      }
    }
  }

  return matrix;
}

/**
 * Error function approximation for normal CDF calculation
 * Using Horner's method for the rational approximation
 */
function erf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);

  const t = 1 / (1 + p * x);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return sign * y;
}

/**
 * Standard normal cumulative distribution function
 */
export function normalCDF(x: number): number {
  return 0.5 * (1 + erf(x / Math.sqrt(2)));
}

/**
 * Calculate percentage returns from price series
 */
export function pctChange(prices: number[]): number[] {
  if (prices.length < 2) return [];
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  return returns;
}

/**
 * Calculate rolling standard deviation
 * Returns array of rolling std devs starting from index (window-1)
 */
export function rollingStdDev(arr: number[], window: number): number[] {
  if (arr.length < window || window < 2) return [];
  const result: number[] = [];
  for (let i = window - 1; i < arr.length; i++) {
    const windowData = arr.slice(i - window + 1, i + 1);
    result.push(stdDev(windowData));
  }
  return result;
}
