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
  // Constraint toggles
  enforceFullInvestment?: boolean; // If false, sum(w) <= 1 instead of sum(w) = 1
  allowShortSelling?: boolean; // If true, weights can be negative
  volMax?: number; // Maximum portfolio volatility (optional)
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
  const {
    rMin,
    wMax = 1.0,
    tolerance = 1e-8,
    maxIterations = 1000,
    enforceFullInvestment = true,
    allowShortSelling = false,
    volMax,
  } = options;

  const wMin = allowShortSelling ? -wMax : 0;

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
    const projected = projectOntoConstraints(newWeights, expectedReturns, covMatrix, {
      rMin,
      wMax,
      wMin,
      enforceFullInvestment,
      volMax,
    });

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

interface ProjectionOptions {
  rMin: number;
  wMax: number;
  wMin: number;
  enforceFullInvestment: boolean;
  volMax?: number;
}

/**
 * Project onto box constraints: wMin <= w[i] <= wMax
 */
function projectOntoBoxConstraints(weights: number[], wMin: number, wMax: number): number[] {
  return weights.map((w) => Math.max(wMin, Math.min(wMax, w)));
}

/**
 * Project onto sum constraint using iterative scaling
 * If enforceEquality = true: sum(w) = 1
 * If enforceEquality = false: sum(w) <= 1
 */
function projectOntoSumConstraint(
  weights: number[],
  target: number,
  enforceEquality: boolean,
  wMin: number,
  wMax: number
): number[] {
  const currentSum = sum(weights);

  // If not enforcing equality and already within constraint, return as-is
  if (!enforceEquality && currentSum <= target + 1e-10) {
    return weights;
  }

  // Handle degenerate case
  if (Math.abs(currentSum) < 1e-12) {
    const equalWeight = target / weights.length;
    return weights.map(() => Math.max(wMin, Math.min(wMax, equalWeight)));
  }

  // Scale proportionally
  const scale = target / currentSum;
  let scaled = weights.map((w) => w * scale);

  // Iteratively apply bounds and redistribute
  for (let iter = 0; iter < 50; iter++) {
    scaled = scaled.map((w) => Math.max(wMin, Math.min(wMax, w)));
    const newSum = sum(scaled);

    if (Math.abs(newSum - target) < 1e-10 || (!enforceEquality && newSum <= target + 1e-10)) {
      break;
    }

    // Redistribute excess/deficit
    const diff = target - newSum;
    const adjustableIndices = scaled
      .map((w, i) => ({ w, i }))
      .filter(({ w }) => (diff > 0 && w < wMax - 1e-10) || (diff < 0 && w > wMin + 1e-10));

    if (adjustableIndices.length > 0) {
      const adjustment = diff / adjustableIndices.length;
      for (const { i } of adjustableIndices) {
        scaled[i] = Math.max(wMin, Math.min(wMax, scaled[i] + adjustment));
      }
    } else {
      break; // Cannot adjust further
    }
  }

  return scaled;
}

/**
 * Adjust weights to satisfy maximum volatility constraint
 * Moves toward minimum variance direction
 */
function adjustForVolatilityConstraint(
  weights: number[],
  covMatrix: number[][],
  volMax: number,
  wMin: number,
  wMax: number
): number[] {
  const targetVariance = volMax * volMax;
  let adjusted = [...weights];

  for (let iter = 0; iter < 100; iter++) {
    const currentVariance = portfolioVariance(adjusted, covMatrix);
    if (currentVariance <= targetVariance + 1e-10) {
      break;
    }

    // Compute gradient of variance: 2 * COV * w
    const gradient = computeVarianceGradient(adjusted, covMatrix);

    // Move in negative gradient direction (toward lower variance)
    const stepSize = 0.05;
    for (let i = 0; i < adjusted.length; i++) {
      adjusted[i] = adjusted[i] - stepSize * gradient[i];
      adjusted[i] = Math.max(wMin, Math.min(wMax, adjusted[i]));
    }

    // Re-normalize to maintain sum constraint
    const total = sum(adjusted);
    if (Math.abs(total) > 1e-12) {
      adjusted = adjusted.map((w) => w / total);
    }
  }

  return adjusted;
}

/**
 * Project weights onto the feasible set:
 * - Sum to 1 (or <= 1 if not enforceFullInvestment)
 * - wMin <= w <= wMax
 * - Expected return >= rMin
 * - Volatility <= volMax (if specified)
 */
function projectOntoConstraints(
  weights: number[],
  expectedReturns: number[],
  covMatrix: number[][],
  options: ProjectionOptions
): number[] {
  const { rMin, wMax, wMin, enforceFullInvestment, volMax } = options;

  let projected = [...weights];

  // Step 1: Apply box constraints
  projected = projectOntoBoxConstraints(projected, wMin, wMax);

  // Step 2: Project onto sum constraint
  if (wMin >= 0) {
    // No short selling - use simplex projection for efficiency
    projected = projectOntoSimplex(projected);
    // Re-apply upper bound after simplex projection
    projected = projected.map((w) => Math.min(wMax, w));
    // Renormalize if needed
    const total = sum(projected);
    if (total > 0 && Math.abs(total - 1) > 1e-10) {
      projected = projected.map((w) => w / total);
    }
  } else {
    // Short selling allowed - use general sum constraint projection
    projected = projectOntoSumConstraint(projected, 1.0, enforceFullInvestment, wMin, wMax);
  }

  // Step 3: Check return constraint and adjust if needed
  const currentReturn = portfolioReturn(projected, expectedReturns);
  if (currentReturn < rMin - 1e-10) {
    projected = adjustForReturnConstraint(projected, expectedReturns, rMin, wMax, wMin);
  }

  // Step 4: Check volatility constraint and adjust if needed
  if (volMax !== undefined) {
    const currentVol = Math.sqrt(portfolioVariance(projected, covMatrix));
    if (currentVol > volMax + 1e-10) {
      projected = adjustForVolatilityConstraint(projected, covMatrix, volMax, wMin, wMax);
    }
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
  wMax: number,
  wMin: number = 0
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
        // Find asset with room to decrease (can go to wMin, which may be negative)
        for (let j = n - 1; j >= 0; j--) {
          const jIdx = indices[j];
          if (jIdx !== i && adjusted[jIdx] > wMin + 1e-10) {
            const delta = Math.min(0.01, wMax - adjusted[i], adjusted[jIdx] - wMin);
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
  if (Math.abs(total) > 1e-12) {
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
  wMax: number = 1.0,
  options?: Partial<OptimizationOptions>
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
      enforceFullInvestment: options?.enforceFullInvestment,
      allowShortSelling: options?.allowShortSelling,
      // Note: volMax is not used for efficient frontier calculation
    });

    returns.push(result.return);
    volatilities.push(result.volatility);
    allWeights.push(result.weights);
  }

  return { returns, volatilities, weights: allWeights };
}

/**
 * Find the optimal portfolio using maximum curvature (knee point)
 * This finds the point on the efficient frontier with the best risk-return trade-off
 */
export function findMaxSharpePortfolio(
  expectedReturns: number[],
  covMatrix: number[][],
  options: {
    wMax?: number;
    riskFreeRate?: number;
    numFrontierPoints?: number;
    enforceFullInvestment?: boolean;
    allowShortSelling?: boolean;
  } = {}
): OptimizationResult {
  const {
    wMax = 1.0,
    numFrontierPoints = 9, // Match displayed frontier
    enforceFullInvestment = true,
    allowShortSelling = false,
  } = options;

  // Calculate efficient frontier
  const frontier = calculateEfficientFrontier(
    expectedReturns,
    covMatrix,
    numFrontierPoints,
    wMax,
    { enforceFullInvestment, allowShortSelling }
  );

  // Find the optimal portfolio using the "knee" method
  // This finds the point furthest from the line connecting the first and last frontier points
  const n = frontier.returns.length;
  if (n < 3) {
    return {
      weights: frontier.weights[0],
      return: frontier.returns[0],
      volatility: frontier.volatilities[0],
      success: true,
    };
  }

  // Line from first point to last point
  const x1 = frontier.volatilities[0];
  const y1 = frontier.returns[0];
  const x2 = frontier.volatilities[n - 1];
  const y2 = frontier.returns[n - 1];

  // Find point with maximum perpendicular distance to the line
  let maxDist = -Infinity;
  let bestIndex = 0;

  for (let i = 0; i < n; i++) {
    const x0 = frontier.volatilities[i];
    const y0 = frontier.returns[i];

    // Perpendicular distance from point (x0, y0) to line through (x1,y1) and (x2,y2)
    const dist = Math.abs((y2 - y1) * x0 - (x2 - x1) * y0 + x2 * y1 - y2 * x1) /
      Math.sqrt(Math.pow(y2 - y1, 2) + Math.pow(x2 - x1, 2));

    if (dist > maxDist) {
      maxDist = dist;
      bestIndex = i;
    }
  }

  return {
    weights: frontier.weights[bestIndex],
    return: frontier.returns[bestIndex],
    volatility: frontier.volatilities[bestIndex],
    success: true,
  };
}
