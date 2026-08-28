import { portfolioVariance, portfolioReturn, sum } from "./matrix.js";
import { AssetBounds, AssetBoundsInput, resolveAssetBounds } from "./bounds.js";

export interface OptimizationResult {
  weights: number[];
  return: number;
  volatility: number;
  success: boolean;
}

/**
 * Constraints shared by every optimization entry point. `wMax` is the fallback
 * cap for assets without their own bound; `wMinPerAsset` / `wMaxPerAsset` pin
 * individual assets to a narrower interval.
 */
export interface ConstraintOptions extends AssetBoundsInput {
  enforceFullInvestment?: boolean; // If false, sum(w) <= 1 instead of sum(w) = 1
  maxLeverage?: number; // Maximum leverage (e.g., 2.0 = 200% = 2x leverage). Default 1.0
}

export interface OptimizationOptions extends ConstraintOptions {
  rMin: number; // Minimum required return
  tolerance?: number;
  maxIterations?: number;
}

/**
 * Whether the weights must sum exactly to the target rather than merely stay
 * under it.
 *
 * Long-only portfolios always take the equality: without short selling, an
 * inequality lets minimum-variance collapse to the trivial all-cash portfolio,
 * which is not a portfolio anyone asked for. Only with short selling on does
 * `enforceFullInvestment` relax the total — matching how this optimizer has
 * always behaved.
 */
function requiresFullInvestment(options: ConstraintOptions): boolean {
  const { enforceFullInvestment = true, allowShortSelling = false } = options;
  return allowShortSelling ? enforceFullInvestment : true;
}

/**
 * Find minimum variance portfolio using projected gradient descent
 *
 * Minimize: w^T * COV * w (portfolio variance)
 * Subject to:
 *   - sum(w) = maxLeverage (weights fully invested)
 *   - w^T * r >= r_min (minimum return constraint)
 *   - lower[i] <= w[i] <= upper[i] (per-asset bounds)
 */
export function findMinVariancePortfolio(
  expectedReturns: number[],
  covMatrix: number[][],
  options: OptimizationOptions
): OptimizationResult {
  const n = expectedReturns.length;
  const {
    rMin,
    tolerance = 1e-8,
    maxIterations = 1000,
    maxLeverage = 1.0,
  } = options;

  const bounds = resolveAssetBounds(n, options);
  const enforceFullInvestment = requiresFullInvestment(options);

  // Start from the feasible point closest to equal weights, so the first
  // gradient step already respects every per-asset floor and cap.
  let weights = projectOntoBounded(
    Array(n).fill(maxLeverage / n),
    maxLeverage,
    bounds,
    true
  );

  // Learning rate (will be adjusted)
  let learningRate = 0.1;

  for (let iter = 0; iter < maxIterations; iter++) {
    // Compute gradient of variance: 2 * COV * w
    const gradient = computeVarianceGradient(weights, covMatrix);

    // Take gradient step
    const newWeights = weights.map((w, i) => w - learningRate * gradient[i]);

    // Project onto constraints
    const projected = projectOntoConstraints(newWeights, expectedReturns, {
      rMin,
      bounds,
      enforceFullInvestment,
      maxLeverage,
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
  bounds: AssetBounds;
  enforceFullInvestment: boolean;
  maxLeverage: number;
}

/**
 * Euclidean projection onto { sum(w) = target, lower <= w <= upper }.
 *
 * The KKT conditions make the solution w(theta)[i] = clamp(v[i] - theta) for a
 * single scalar theta, and sum(w(theta)) decreases monotonically in theta — so
 * a bisection on theta lands exactly on the target. This handles per-asset
 * floors, per-asset caps and short selling in one step, where a plain simplex
 * projection only handles a zero floor.
 *
 * When `enforceEquality` is false the total may sit anywhere in [0, target] —
 * the uninvested remainder is cash. It is floored at zero because a portfolio
 * that is net short overall is not "holding cash"; without that floor, short
 * positions run away to their bounds.
 */
function projectOntoBounded(
  v: number[],
  target: number,
  bounds: AssetBounds,
  enforceEquality: boolean
): number[] {
  const { lower, upper } = bounds;
  const clampAll = (theta: number) =>
    v.map((vi, i) => Math.min(upper[i], Math.max(lower[i], vi - theta)));
  const totalAt = (theta: number) => sum(clampAll(theta));

  // Infeasible targets are pulled back to the closest reachable total, so an
  // over-tight set of bounds degrades to its nearest portfolio instead of
  // returning garbage. The API rejects those inputs before we get here.
  const minTotal = sum(lower);
  const maxTotal = sum(upper);
  const clampToReachable = (t: number) => Math.min(Math.max(t, minTotal), maxTotal);
  let goal = clampToReachable(target);

  if (!enforceEquality) {
    const asIs = clampAll(0);
    const asIsTotal = sum(asIs);
    if (asIsTotal >= -1e-10 && asIsTotal <= goal + 1e-10) return asIs;
    // Outside the band: pull the total back to the nearer edge.
    goal = asIsTotal < 0 ? clampToReachable(0) : goal;
  }

  // Bracket theta: at -spread every weight sits at its cap, at +spread at its floor.
  const spread =
    Math.max(...v.map(Math.abs), ...upper.map(Math.abs), ...lower.map(Math.abs), 1) * 2 + 1;
  let lo = -spread;
  let hi = spread;

  for (let iter = 0; iter < 100; iter++) {
    const mid = (lo + hi) / 2;
    const total = totalAt(mid);
    if (Math.abs(total - goal) < 1e-12) {
      lo = hi = mid;
      break;
    }
    // totalAt is non-increasing in theta.
    if (total > goal) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return clampAll((lo + hi) / 2);
}

/**
 * Project weights onto the feasible set:
 * - Sum to maxLeverage (or <= maxLeverage if not enforceFullInvestment)
 * - lower <= w <= upper
 * - Expected return >= rMin
 */
function projectOntoConstraints(
  weights: number[],
  expectedReturns: number[],
  options: ProjectionOptions
): number[] {
  const { rMin, bounds, enforceFullInvestment, maxLeverage } = options;

  let projected = projectOntoBounded(weights, maxLeverage, bounds, enforceFullInvestment);

  // Check return constraint and adjust if needed
  const currentReturn = portfolioReturn(projected, expectedReturns);
  if (currentReturn < rMin - 1e-10) {
    projected = adjustForReturnConstraint(projected, expectedReturns, rMin, bounds);
  }

  return projected;
}

/**
 * Adjust weights to meet minimum return constraint by shifting weight from the
 * lowest-return assets to the highest-return ones. Every transfer is capped by
 * the assets' own bounds, and the portfolio total is preserved.
 */
function adjustForReturnConstraint(
  weights: number[],
  expectedReturns: number[],
  rMin: number,
  bounds: AssetBounds
): number[] {
  const n = weights.length;
  const adjusted = [...weights];
  const { lower, upper } = bounds;

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
      if (adjusted[i] < upper[i] - 1e-10) {
        // Find asset with room to decrease (down to its own floor)
        for (let j = n - 1; j >= 0; j--) {
          const jIdx = indices[j];
          if (jIdx !== i && adjusted[jIdx] > lower[jIdx] + 1e-10) {
            const delta = Math.min(0.01, upper[i] - adjusted[i], adjusted[jIdx] - lower[jIdx]);
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
  options?: ConstraintOptions
): { returns: number[]; volatilities: number[]; weights: number[][] } {
  const maxLeverage = options?.maxLeverage ?? 1.0;

  // Scale expected returns for leverage (higher leverage = higher potential returns)
  const minReturn = Math.min(...expectedReturns) * maxLeverage;
  const maxReturn = Math.max(...expectedReturns) * maxLeverage;

  const returns: number[] = [];
  const volatilities: number[] = [];
  const allWeights: number[][] = [];

  for (let i = 0; i < numPoints; i++) {
    const targetReturn = minReturn + (i / (numPoints - 1)) * (maxReturn - minReturn);

    const result = findMinVariancePortfolio(expectedReturns, covMatrix, {
      ...options,
      rMin: targetReturn,
      wMax: options?.wMax ?? wMax,
      maxLeverage,
    });

    returns.push(result.return);
    volatilities.push(result.volatility);
    allWeights.push(result.weights);
  }

  return { returns, volatilities, weights: allWeights };
}

/**
 * Find the portfolio with maximum Sharpe ratio
 * Sharpe = (return - riskFreeRate) / volatility
 */
export function findMaxSharpePortfolio(
  expectedReturns: number[],
  covMatrix: number[][],
  options: ConstraintOptions & {
    riskFreeRate?: number;
    numFrontierPoints?: number;
  } = {}
): OptimizationResult & { sharpeRatio: number } {
  const { riskFreeRate = 0, numFrontierPoints = 200 } = options;

  // Calculate efficient frontier
  const frontier = calculateEfficientFrontier(
    expectedReturns,
    covMatrix,
    numFrontierPoints,
    options.wMax ?? 1.0,
    options
  );

  // Find portfolio with maximum Sharpe ratio
  let maxSharpe = -Infinity;
  let bestIndex = 0;

  for (let i = 0; i < frontier.returns.length; i++) {
    const ret = frontier.returns[i];
    const vol = frontier.volatilities[i];

    if (vol > 0) {
      const sharpe = (ret - riskFreeRate) / vol;
      if (sharpe > maxSharpe) {
        maxSharpe = sharpe;
        bestIndex = i;
      }
    }
  }

  return {
    weights: frontier.weights[bestIndex],
    return: frontier.returns[bestIndex],
    volatility: frontier.volatilities[bestIndex],
    sharpeRatio: maxSharpe,
    success: true,
  };
}

/**
 * Find the portfolio with maximum return: every asset starts at its floor, and
 * the capital left over goes to the highest-return assets until each hits its
 * cap.
 */
export function findMaxReturnPortfolio(
  expectedReturns: number[],
  covMatrix: number[][],
  options: ConstraintOptions = {}
): OptimizationResult {
  const n = expectedReturns.length;
  const target = options.maxLeverage ?? 1.0;
  const bounds = resolveAssetBounds(n, options);

  const weights = [...bounds.lower];
  let remaining = target - sum(weights);

  const indices = Array.from({ length: n }, (_, i) => i);
  indices.sort((a, b) => expectedReturns[b] - expectedReturns[a]);

  for (const idx of indices) {
    if (remaining <= 1e-10) break;
    const room = bounds.upper[idx] - weights[idx];
    const allocation = Math.min(room, remaining);
    weights[idx] += allocation;
    remaining -= allocation;
  }

  // Over-subscribed floors (sum(lower) > target) can only be resolved by
  // projecting back onto the total.
  if (remaining < -1e-10) {
    const projected = projectOntoBounded(weights, target, bounds, true);
    return {
      weights: projected,
      return: portfolioReturn(projected, expectedReturns),
      volatility: Math.sqrt(portfolioVariance(projected, covMatrix)),
      success: true,
    };
  }

  return {
    weights,
    return: portfolioReturn(weights, expectedReturns),
    volatility: Math.sqrt(portfolioVariance(weights, covMatrix)),
    success: true,
  };
}

/**
 * Find minimum variance portfolio for a target return
 */
export function findTargetReturnPortfolio(
  expectedReturns: number[],
  covMatrix: number[][],
  targetReturn: number,
  options: ConstraintOptions = {}
): OptimizationResult {
  return findMinVariancePortfolio(expectedReturns, covMatrix, {
    ...options,
    rMin: targetReturn,
  });
}

/**
 * Find maximum return portfolio for a target risk (volatility)
 */
export function findTargetRiskPortfolio(
  expectedReturns: number[],
  covMatrix: number[][],
  targetVolatility: number,
  options: ConstraintOptions & { numFrontierPoints?: number } = {}
): OptimizationResult {
  const { numFrontierPoints = 200 } = options;

  const frontier = calculateEfficientFrontier(
    expectedReturns,
    covMatrix,
    numFrontierPoints,
    options.wMax ?? 1.0,
    options
  );

  let bestIndex = 0;
  let bestReturn = -Infinity;

  for (let i = 0; i < frontier.volatilities.length; i++) {
    if (frontier.volatilities[i] <= targetVolatility + 1e-6) {
      if (frontier.returns[i] > bestReturn) {
        bestReturn = frontier.returns[i];
        bestIndex = i;
      }
    }
  }

  if (bestReturn === -Infinity) {
    let minVolIdx = 0;
    let minVol = frontier.volatilities[0];
    for (let i = 1; i < frontier.volatilities.length; i++) {
      if (frontier.volatilities[i] < minVol) {
        minVol = frontier.volatilities[i];
        minVolIdx = i;
      }
    }
    bestIndex = minVolIdx;
  }

  return {
    weights: frontier.weights[bestIndex],
    return: frontier.returns[bestIndex],
    volatility: frontier.volatilities[bestIndex],
    success: true,
  };
}

/**
 * Find the knee point portfolio (maximum curvature on the efficient frontier)
 */
export function findKneePointPortfolio(
  expectedReturns: number[],
  covMatrix: number[][],
  options: ConstraintOptions & { numFrontierPoints?: number } = {}
): OptimizationResult {
  const { numFrontierPoints = 200 } = options;

  const frontier = calculateEfficientFrontier(
    expectedReturns,
    covMatrix,
    numFrontierPoints,
    options.wMax ?? 1.0,
    options
  );

  const n = frontier.returns.length;
  if (n < 3) {
    return {
      weights: frontier.weights[0],
      return: frontier.returns[0],
      volatility: frontier.volatilities[0],
      success: true,
    };
  }

  const x1 = frontier.volatilities[0];
  const y1 = frontier.returns[0];
  const x2 = frontier.volatilities[n - 1];
  const y2 = frontier.returns[n - 1];

  let maxDist = -Infinity;
  let bestIndex = 0;

  for (let i = 0; i < n; i++) {
    const x0 = frontier.volatilities[i];
    const y0 = frontier.returns[i];

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
