import { portfolioVariance, portfolioReturn, sum } from "./matrix";

export interface OptimizationResult {
  weights: number[];
  return: number;
  volatility: number;
  success: boolean;
}

export interface OptimizationOptions {
  rMin: number;
  wMax: number;
  tolerance?: number;
  maxIterations?: number;
  enforceFullInvestment?: boolean;
  allowShortSelling?: boolean;
}

/**
 * Find minimum variance portfolio using projected gradient descent
 */
export function findMinVariancePortfolio(
  expectedReturns: number[],
  covMatrix: number[][],
  options: OptimizationOptions
): OptimizationResult {
  const n = expectedReturns.length;
  const { rMin, wMax = 1.0, tolerance = 1e-8, maxIterations = 1000 } = options;

  let weights = Array(n).fill(1 / n);
  let learningRate = 0.1;

  for (let iter = 0; iter < maxIterations; iter++) {
    const gradient = computeVarianceGradient(weights, covMatrix);
    const newWeights = weights.map((w, i) => w - learningRate * gradient[i]);
    const projected = projectOntoConstraints(newWeights, expectedReturns, rMin, wMax);

    const diff = Math.sqrt(projected.reduce((sum, w, i) => sum + Math.pow(w - weights[i], 2), 0));
    weights = projected;

    if (diff < tolerance) break;

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

function projectOntoConstraints(
  weights: number[],
  expectedReturns: number[],
  rMin: number,
  wMax: number
): number[] {
  const n = weights.length;
  let projected = [...weights];

  for (let i = 0; i < n; i++) {
    projected[i] = Math.max(0, Math.min(wMax, projected[i]));
  }

  projected = projectOntoSimplex(projected);

  for (let i = 0; i < n; i++) {
    projected[i] = Math.min(wMax, projected[i]);
  }

  const total = sum(projected);
  if (total > 0 && Math.abs(total - 1) > 1e-10) {
    projected = projected.map((w) => w / total);
  }

  const currentReturn = portfolioReturn(projected, expectedReturns);
  if (currentReturn < rMin - 1e-10) {
    projected = adjustForReturnConstraint(projected, expectedReturns, rMin, wMax);
  }

  return projected;
}

function projectOntoSimplex(v: number[]): number[] {
  const n = v.length;
  const u = [...v].sort((a, b) => b - a);

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

function adjustForReturnConstraint(
  weights: number[],
  expectedReturns: number[],
  rMin: number,
  wMax: number
): number[] {
  const n = weights.length;
  const adjusted = [...weights];

  const indices = Array.from({ length: n }, (_, i) => i);
  indices.sort((a, b) => expectedReturns[b] - expectedReturns[a]);

  for (let iteration = 0; iteration < 100; iteration++) {
    const currentReturn = portfolioReturn(adjusted, expectedReturns);
    if (currentReturn >= rMin - 1e-10) break;

    let increased = false;
    for (const i of indices) {
      if (adjusted[i] < wMax - 1e-10) {
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
  wMax: number = 1.0,
  options?: { enforceFullInvestment?: boolean; allowShortSelling?: boolean }
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
  } = {},
  frontierData?: { returns: number[]; volatilities: number[]; weights: number[][] }
): OptimizationResult {
  const {
    wMax = 1.0,
    numFrontierPoints = 9,
    enforceFullInvestment = true,
    allowShortSelling = false,
  } = options;

  // Use provided frontier or calculate new one
  const frontier = frontierData || calculateEfficientFrontier(
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
