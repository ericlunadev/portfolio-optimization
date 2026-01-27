import { portfolioVariance, portfolioReturn, sum } from "./matrix.js";

export interface OptimizationResult {
  weights: number[];
  return: number;
  volatility: number;
  success: boolean;
}

export interface OptimizationOptions {
  rMin: number; // Minimum required return
  wMax: number; // Maximum weight per asset (default 1.0)
  tolerance?: number;
  maxIterations?: number;
}

/**
 * Find minimum variance portfolio using projected gradient descent
 *
 * Minimize: w^T * COV * w (portfolio variance)
 * Subject to:
 *   - sum(w) = 1 (weights sum to 1)
 *   - w^T * r >= r_min (minimum return constraint)
 *   - 0 <= w[i] <= w_max (bounds)
 */
export function findMinVariancePortfolio(
  expectedReturns: number[],
  covMatrix: number[][],
  options: OptimizationOptions
): OptimizationResult {
  const n = expectedReturns.length;
  const { rMin, wMax = 1.0, tolerance = 1e-8, maxIterations = 1000 } = options;

  // Initial weights: equal weight
  let weights = Array(n).fill(1 / n);

  // Learning rate (will be adjusted)
  let learningRate = 0.1;

  for (let iter = 0; iter < maxIterations; iter++) {
    // Compute gradient of variance: 2 * COV * w
    const gradient = computeVarianceGradient(weights, covMatrix);

    // Take gradient step
    const newWeights = weights.map((w, i) => w - learningRate * gradient[i]);

    // Project onto constraints
    const projected = projectOntoConstraints(newWeights, expectedReturns, rMin, wMax);

    // Check convergence
    const diff = Math.sqrt(projected.reduce((sum, w, i) => sum + Math.pow(w - weights[i], 2), 0));

    weights = projected;

    if (diff < tolerance) {
      break;
    }

    // Adaptive learning rate
    if (iter > 0 && iter % 100 === 0) {
      learningRate *= 0.9;
    }
  }

  const variance = portfolioVariance(weights, covMatrix);
  const ret = portfolioReturn(weights, expectedReturns);

  return {
    weights,
    return: ret,
    volatility: Math.sqrt(variance),
    success: true,
  };
}

/**
 * Compute gradient of portfolio variance: 2 * COV * w
 */
function computeVarianceGradient(weights: number[], covMatrix: number[][]): number[] {
  const n = weights.length;
  const gradient: number[] = Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      gradient[i] += 2 * covMatrix[i][j] * weights[j];
    }
  }

  return gradient;
}

/**
 * Project weights onto the feasible set:
 * - Sum to 1
 * - w >= 0
 * - w <= wMax
 * - Expected return >= rMin
 */
function projectOntoConstraints(
  weights: number[],
  expectedReturns: number[],
  rMin: number,
  wMax: number
): number[] {
  const n = weights.length;
  let projected = [...weights];

  // Apply bounds: 0 <= w <= wMax
  for (let i = 0; i < n; i++) {
    projected[i] = Math.max(0, Math.min(wMax, projected[i]));
  }

  // Project onto simplex (sum = 1) using Duchi's algorithm
  projected = projectOntoSimplex(projected);

  // Re-apply upper bound after simplex projection
  for (let i = 0; i < n; i++) {
    projected[i] = Math.min(wMax, projected[i]);
  }

  // Renormalize if needed
  const total = sum(projected);
  if (total > 0 && Math.abs(total - 1) > 1e-10) {
    projected = projected.map((w) => w / total);
  }

  // Check return constraint and adjust if needed
  const currentReturn = portfolioReturn(projected, expectedReturns);
  if (currentReturn < rMin - 1e-10) {
    // Try to increase allocation to higher return assets
    projected = adjustForReturnConstraint(projected, expectedReturns, rMin, wMax);
  }

  return projected;
}

/**
 * Project onto probability simplex using Duchi et al. algorithm
 * Ensures sum(w) = 1 and w >= 0
 */
function projectOntoSimplex(v: number[]): number[] {
  const n = v.length;
  const u = [...v].sort((a, b) => b - a); // Sort descending

  let cumSum = 0;
  let rho = 0;

  for (let j = 0; j < n; j++) {
    cumSum += u[j];
    if (u[j] + (1 - cumSum) / (j + 1) > 0) {
      rho = j + 1;
    }
  }

  const theta = (u.slice(0, rho).reduce((a, b) => a + b, 0) - 1) / rho;

  return v.map((vi) => Math.max(0, vi - theta));
}

/**
 * Adjust weights to meet minimum return constraint
 */
function adjustForReturnConstraint(
  weights: number[],
  expectedReturns: number[],
  rMin: number,
  wMax: number
): number[] {
  const n = weights.length;
  const adjusted = [...weights];

  // Sort assets by expected return (descending)
  const indices = Array.from({ length: n }, (_, i) => i);
  indices.sort((a, b) => expectedReturns[b] - expectedReturns[a]);

  // Iteratively increase weight on higher return assets
  for (let iteration = 0; iteration < 100; iteration++) {
    const currentReturn = portfolioReturn(adjusted, expectedReturns);
    if (currentReturn >= rMin - 1e-10) break;

    // Find asset with room to increase
    let increased = false;
    for (const i of indices) {
      if (adjusted[i] < wMax - 1e-10) {
        // Find asset with room to decrease
        for (let j = n - 1; j >= 0; j--) {
          const jIdx = indices[j];
          if (jIdx !== i && adjusted[jIdx] > 1e-10) {
            const delta = Math.min(0.01, wMax - adjusted[i], adjusted[jIdx]);
            adjusted[i] += delta;
            adjusted[jIdx] -= delta;
            increased = true;
            break;
          }
        }
        if (increased) break;
      }
    }
    if (!increased) break;
  }

  // Renormalize
  const total = sum(adjusted);
  if (total > 0) {
    return adjusted.map((w) => w / total);
  }
  return adjusted;
}

/**
 * Calculate efficient frontier points
 */
export function calculateEfficientFrontier(
  expectedReturns: number[],
  covMatrix: number[][],
  numPoints: number = 9,
  wMax: number = 1.0
): { returns: number[]; volatilities: number[]; weights: number[][] } {
  const minReturn = Math.min(...expectedReturns);
  const maxReturn = Math.max(...expectedReturns);

  const returns: number[] = [];
  const volatilities: number[] = [];
  const allWeights: number[][] = [];

  for (let i = 0; i < numPoints; i++) {
    const targetReturn = minReturn + (i / (numPoints - 1)) * (maxReturn - minReturn);

    const result = findMinVariancePortfolio(expectedReturns, covMatrix, {
      rMin: targetReturn,
      wMax,
    });

    returns.push(result.return);
    volatilities.push(result.volatility);
    allWeights.push(result.weights);
  }

  return { returns, volatilities, weights: allWeights };
}
