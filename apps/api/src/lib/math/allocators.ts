import { dot, portfolioReturn, portfolioVariance, sum } from "./matrix.js";
import { AssetBounds, projectOntoBounded, resolveAssetBounds } from "./bounds.js";
import type { ConstraintOptions, OptimizationResult } from "./optimizer.js";

/**
 * Allocators that size positions from risk alone.
 *
 * Every strategy in `optimizer.ts` walks the mean-variance efficient frontier,
 * so each one inherits Markowitz's weakness: expected returns estimated from a
 * price history are noisy, and the optimizer happily concentrates the whole
 * portfolio in whichever asset the noise favoured. The allocators here sidestep
 * that by ignoring expected returns when choosing weights — they read only the
 * covariance matrix, or the return history itself in the case of CVaR.
 *
 * Expected returns still come back in the result, because the app reports the
 * same return/volatility pair for every strategy; they are measured from the
 * chosen weights rather than used to choose them.
 */

/** Weights are refined until no single weight moves by more than this. */
const CONVERGENCE_TOLERANCE = 1e-10;

/**
 * Whether the weights must sum exactly to the target rather than merely stay
 * under it. Mirrors the rule in `optimizer.ts`: long-only portfolios always
 * take the equality, since an inequality lets a risk-minimizing objective
 * collapse to all cash.
 */
function requiresFullInvestment(options: ConstraintOptions): boolean {
  const { enforceFullInvestment = true, allowShortSelling = false } = options;
  return allowShortSelling ? enforceFullInvestment : true;
}

/** Matrix-vector product, `M * v`. */
function matVec(matrix: number[][], v: number[]): number[] {
  return matrix.map((row) => dot(row, v));
}

/** Rescale a vector of non-negative parts so it sums to `target`. */
function normalizeTo(v: number[], target: number): number[] {
  const total = sum(v);
  if (!Number.isFinite(total) || Math.abs(total) < 1e-15) {
    return v.map(() => target / v.length);
  }
  return v.map((x) => (x / total) * target);
}

/**
 * Report a portfolio the way every optimizer entry point does: the weights
 * themselves plus the annualized return and volatility they imply.
 */
export function describePortfolio(
  weights: number[],
  expectedReturns: number[],
  covMatrix: number[][]
): OptimizationResult {
  return {
    weights,
    return: portfolioReturn(weights, expectedReturns),
    volatility: Math.sqrt(Math.max(0, portfolioVariance(weights, covMatrix))),
    success: true,
  };
}

/** The context every allocator needs: resolved bounds and a total to hit. */
interface AllocationContext {
  bounds: AssetBounds;
  target: number;
  enforceEquality: boolean;
}

function allocationContext(n: number, options: ConstraintOptions): AllocationContext {
  return {
    bounds: resolveAssetBounds(n, options),
    target: options.maxLeverage ?? 1.0,
    enforceEquality: requiresFullInvestment(options),
  };
}

/** Pull a candidate weight vector back into the feasible set. */
function feasible(weights: number[], ctx: AllocationContext): number[] {
  return projectOntoBounded(weights, ctx.target, ctx.bounds, ctx.enforceEquality);
}

/**
 * Equal weight: the same fraction in every asset.
 *
 * Naive as it looks, 1/N is a stubborn benchmark — DeMiguel, Garlappi and Uppal
 * found it beats most optimized allocations out of sample, because it has no
 * parameters to estimate and therefore no estimation error to amplify. It is
 * the reference point the other strategies have to earn their complexity
 * against.
 */
export function findEqualWeightPortfolio(
  expectedReturns: number[],
  covMatrix: number[][],
  options: ConstraintOptions = {}
): OptimizationResult {
  const n = expectedReturns.length;
  const ctx = allocationContext(n, options);
  const weights = feasible(Array(n).fill(ctx.target / n), ctx);
  return describePortfolio(weights, expectedReturns, covMatrix);
}

/**
 * Risk parity: every asset contributes the same share of portfolio risk.
 *
 * Asset `i` contributes `w_i * (COV * w)_i` to the portfolio variance. Equal
 * weighting equalizes capital, which in a stock/bond portfolio hands nearly all
 * the risk to the stocks; risk parity equalizes the risk instead, so a volatile
 * asset simply gets a smaller position.
 *
 * Solved by the fixed-point iteration `w_i <- 1 / (COV * w)_i` (Chaves et al.),
 * which lands exactly on equal contributions: at the fixed point every
 * `w_i * (COV * w)_i` is the same constant. The step is damped because an
 * undamped update oscillates when two assets are near-perfectly correlated.
 *
 * The iteration is inherently long-only — a risk contribution is only
 * meaningful for a positive position — so per-asset bounds are applied
 * afterwards by projection. Tight bounds therefore trade exact parity for
 * feasibility.
 */
export function findRiskParityPortfolio(
  expectedReturns: number[],
  covMatrix: number[][],
  options: ConstraintOptions & { maxIterations?: number } = {}
): OptimizationResult {
  const n = expectedReturns.length;
  const { maxIterations = 1000 } = options;
  const ctx = allocationContext(n, options);
  const damping = 0.5;

  let weights: number[] = Array(n).fill(1 / n);

  for (let iter = 0; iter < maxIterations; iter++) {
    const marginal = matVec(covMatrix, weights);

    // A non-positive marginal risk means the asset is a perfect hedge for the
    // rest of the book; there is no weight that gives it a positive risk share,
    // so hold it at its current size rather than dividing by ~0.
    const candidate = weights.map((w, i) =>
      marginal[i] > 1e-12 ? 1 / marginal[i] : w
    );
    const next = normalizeTo(
      weights.map((w, i) => (1 - damping) * w + damping * candidate[i]),
      1
    );

    const shift = Math.max(...next.map((w, i) => Math.abs(w - weights[i])));
    weights = next;
    if (shift < CONVERGENCE_TOLERANCE) break;
  }

  return describePortfolio(
    feasible(normalizeTo(weights, ctx.target), ctx),
    expectedReturns,
    covMatrix
  );
}

/**
 * Maximum diversification: maximize the diversification ratio
 * `(w . vol) / sqrt(w' COV w)`.
 *
 * The numerator is the volatility the portfolio would have if its assets never
 * moved together; the denominator is the volatility it actually has. Their
 * ratio measures how much risk correlation cancels out, and maximizing it
 * (Choueifaty and Coignard) buys the assets that diversify each other rather
 * than the ones that happen to be quiet.
 *
 * Maximized by projected gradient ascent on the log of the ratio, whose
 * gradient is `vol / (w . vol) - (COV * w) / (w' COV w)`. Steps are accepted
 * only when they improve the ratio, so the line search cannot walk off a ridge.
 */
export function findMaxDiversificationPortfolio(
  expectedReturns: number[],
  covMatrix: number[][],
  options: ConstraintOptions & { maxIterations?: number } = {}
): OptimizationResult {
  const n = expectedReturns.length;
  const { maxIterations = 500 } = options;
  const ctx = allocationContext(n, options);

  const volatilities = covMatrix.map((row, i) => Math.sqrt(Math.max(0, row[i])));

  const diversificationRatio = (w: number[]): number => {
    const weightedVol = dot(w, volatilities);
    const variance = portfolioVariance(w, covMatrix);
    if (variance <= 1e-18 || weightedVol <= 0) return -Infinity;
    return weightedVol / Math.sqrt(variance);
  };

  let weights = feasible(Array(n).fill(ctx.target / n), ctx);
  let best = diversificationRatio(weights);
  let step = 0.1;

  for (let iter = 0; iter < maxIterations && step > 1e-12; iter++) {
    const weightedVol = dot(weights, volatilities);
    const variance = portfolioVariance(weights, covMatrix);
    if (weightedVol <= 0 || variance <= 1e-18) break;

    const marginal = matVec(covMatrix, weights);
    const gradient = volatilities.map(
      (vol, i) => vol / weightedVol - marginal[i] / variance
    );

    const candidate = feasible(
      weights.map((w, i) => w + step * gradient[i]),
      ctx
    );
    const candidateRatio = diversificationRatio(candidate);

    if (candidateRatio > best) {
      const shift = Math.max(...candidate.map((w, i) => Math.abs(w - weights[i])));
      weights = candidate;
      best = candidateRatio;
      step *= 1.2;
      if (shift < CONVERGENCE_TOLERANCE) break;
    } else {
      step *= 0.5;
    }
  }

  return describePortfolio(weights, expectedReturns, covMatrix);
}

/**
 * Hierarchical risk parity (López de Prado).
 *
 * Mean-variance optimization inverts the covariance matrix, and that inverse is
 * unstable: a handful of highly correlated assets makes the matrix nearly
 * singular, so tiny changes in the price history swing the weights wildly. HRP
 * never inverts anything. It clusters the assets by correlation, then splits
 * capital down the resulting tree, giving each branch a share inversely
 * proportional to its variance.
 *
 * Three stages: build a single-linkage tree over the correlation distance;
 * order the assets by walking that tree, so correlated assets sit next to each
 * other; then bisect the ordered list recursively, splitting capital between
 * the two halves by inverse variance.
 */
export function findHierarchicalRiskParityPortfolio(
  expectedReturns: number[],
  covMatrix: number[][],
  options: ConstraintOptions = {}
): OptimizationResult {
  const n = expectedReturns.length;
  const ctx = allocationContext(n, options);

  if (n === 1) {
    return describePortfolio(feasible([ctx.target], ctx), expectedReturns, covMatrix);
  }

  const order = clusterOrder(covMatrix);
  const weights = Array(n).fill(1);
  bisect(order, weights, covMatrix);

  return describePortfolio(
    feasible(normalizeTo(weights, ctx.target), ctx),
    expectedReturns,
    covMatrix
  );
}

/**
 * Order the assets so that correlated ones sit adjacent, by building a
 * single-linkage tree over the correlation distance and reading off its leaves.
 *
 * The distance is López de Prado's two-step metric: assets are first placed at
 * `sqrt((1 - corr) / 2)` from each other, then compared by the Euclidean
 * distance between their full distance vectors — so two assets count as close
 * when they relate to *the rest of the book* the same way, not merely when they
 * correlate with each other.
 */
function clusterOrder(covMatrix: number[][]): number[] {
  const n = covMatrix.length;
  const vol = covMatrix.map((row, i) => Math.sqrt(Math.max(0, row[i])));

  const correlationDistance: number[][] = [];
  for (let i = 0; i < n; i++) {
    correlationDistance[i] = [];
    for (let j = 0; j < n; j++) {
      const denom = vol[i] * vol[j];
      const corr = denom > 1e-18 ? Math.max(-1, Math.min(1, covMatrix[i][j] / denom)) : 0;
      correlationDistance[i][j] = Math.sqrt(Math.max(0, (1 - corr) / 2));
    }
  }

  const distance: number[][] = [];
  for (let i = 0; i < n; i++) {
    distance[i] = [];
    for (let j = 0; j < n; j++) {
      let acc = 0;
      for (let k = 0; k < n; k++) {
        acc += Math.pow(correlationDistance[i][k] - correlationDistance[j][k], 2);
      }
      distance[i][j] = Math.sqrt(acc);
    }
  }

  // Agglomerate the closest pair until one cluster remains. Each cluster keeps
  // its leaves in order, so the final cluster is the leaf ordering.
  let clusters = Array.from({ length: n }, (_, i) => [i]);

  while (clusters.length > 1) {
    let bestDistance = Infinity;
    let a = 0;
    let b = 1;

    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        // Single linkage: two clusters are as close as their closest members.
        let linkage = Infinity;
        for (const p of clusters[i]) {
          for (const q of clusters[j]) {
            linkage = Math.min(linkage, distance[p][q]);
          }
        }
        if (linkage < bestDistance) {
          bestDistance = linkage;
          a = i;
          b = j;
        }
      }
    }

    const merged = [...clusters[a], ...clusters[b]];
    clusters = clusters.filter((_, i) => i !== a && i !== b);
    clusters.push(merged);
  }

  return clusters[0];
}

/**
 * Split capital down the ordered list: halve it, give each half a share
 * inversely proportional to its variance, then recurse into both halves.
 *
 * `weights` starts at all ones and is scaled in place, so each asset ends up
 * holding the product of every split it survived.
 */
function bisect(items: number[], weights: number[], covMatrix: number[][]): void {
  if (items.length < 2) return;

  const half = Math.floor(items.length / 2);
  const left = items.slice(0, half);
  const right = items.slice(half);

  const leftVariance = clusterVariance(left, covMatrix);
  const rightVariance = clusterVariance(right, covMatrix);
  const total = leftVariance + rightVariance;

  // Equal variance (or no variance to speak of) splits the capital evenly.
  const leftShare = total > 1e-18 ? 1 - leftVariance / total : 0.5;

  for (const i of left) weights[i] *= leftShare;
  for (const i of right) weights[i] *= 1 - leftShare;

  bisect(left, weights, covMatrix);
  bisect(right, weights, covMatrix);
}

/**
 * Variance of a sub-cluster held at inverse-variance weights — the standard
 * stand-in for "how risky is this branch", cheap because it needs no inverse.
 */
function clusterVariance(items: number[], covMatrix: number[][]): number {
  const inverseVariance = items.map((i) => {
    const variance = covMatrix[i][i];
    return variance > 1e-18 ? 1 / variance : 0;
  });
  const total = sum(inverseVariance);
  const w = total > 1e-18
    ? inverseVariance.map((iv) => iv / total)
    : items.map(() => 1 / items.length);

  let acc = 0;
  for (let i = 0; i < items.length; i++) {
    for (let j = 0; j < items.length; j++) {
      acc += w[i] * w[j] * covMatrix[items[i]][items[j]];
    }
  }
  return acc;
}

/**
 * Minimum Conditional Value at Risk: the smallest average loss across the worst
 * `1 - confidence` of the historical periods.
 *
 * Volatility punishes upside and downside alike and assumes returns are normal,
 * which understates exactly the crash risk investors care about. CVaR reads the
 * left tail of the observed return history directly, so a portfolio that is
 * calm most of the time but occasionally collapses is scored on the collapse.
 *
 * Minimized through the Rockafellar-Uryasev form, which turns CVaR into
 * `min over z of z + mean(max(0, loss - z)) / (1 - confidence)`. For fixed
 * weights the best `z` is just the empirical VaR quantile, so each iteration
 * reads off that quantile and then steps the weights against the gradient of
 * the tail average. The step direction is normalized because daily losses are
 * small numbers and the raw gradient would barely move the weights.
 *
 * @param scenarioReturns Per-period returns, indexed `[asset][period]`; every
 *   asset must cover the same periods.
 */
export function findMinCVaRPortfolio(
  scenarioReturns: number[][],
  expectedReturns: number[],
  covMatrix: number[][],
  options: ConstraintOptions & { confidence?: number; maxIterations?: number } = {}
): OptimizationResult {
  const n = expectedReturns.length;
  const { confidence = 0.95, maxIterations = 500 } = options;
  const ctx = allocationContext(n, options);

  const periods = scenarioReturns[0]?.length ?? 0;

  // Without a return history there is no tail to minimize. Fall back to equal
  // weight rather than reporting a portfolio the data cannot support.
  if (periods < 2 || scenarioReturns.length !== n) {
    return findEqualWeightPortfolio(expectedReturns, covMatrix, options);
  }

  const tailFraction = Math.max(1e-6, 1 - confidence);

  /** Loss (negative return) of the portfolio in each period. */
  const losses = (w: number[]): number[] => {
    const out = Array(periods).fill(0);
    for (let i = 0; i < n; i++) {
      const asset = scenarioReturns[i];
      const weight = w[i];
      for (let t = 0; t < periods; t++) out[t] -= weight * asset[t];
    }
    return out;
  };

  /** Empirical CVaR, plus the VaR threshold it is measured beyond. */
  const conditionalValueAtRisk = (w: number[]): { cvar: number; valueAtRisk: number } => {
    const loss = losses(w);
    const sorted = [...loss].sort((a, b) => a - b);
    const index = Math.min(periods - 1, Math.floor(confidence * periods));
    const valueAtRisk = sorted[index];
    let excess = 0;
    for (const l of loss) excess += Math.max(0, l - valueAtRisk);
    return { cvar: valueAtRisk + excess / (tailFraction * periods), valueAtRisk };
  };

  let weights = feasible(Array(n).fill(ctx.target / n), ctx);
  let best = conditionalValueAtRisk(weights).cvar;
  let bestWeights = weights;
  let step = 0.25;

  for (let iter = 0; iter < maxIterations && step > 1e-12; iter++) {
    const { valueAtRisk } = conditionalValueAtRisk(weights);
    const loss = losses(weights);

    // Only the periods in the tail move the objective, and each contributes
    // -r[i][t]: shifting weight into an asset that held up in those periods
    // lowers the average tail loss.
    const gradient = Array(n).fill(0);
    for (let t = 0; t < periods; t++) {
      if (loss[t] <= valueAtRisk) continue;
      for (let i = 0; i < n; i++) {
        gradient[i] -= scenarioReturns[i][t] / (tailFraction * periods);
      }
    }

    const norm = Math.sqrt(gradient.reduce((acc, g) => acc + g * g, 0));
    if (norm < 1e-15) break;

    const candidate = feasible(
      weights.map((w, i) => w - (step * gradient[i]) / norm),
      ctx
    );
    const candidateCvar = conditionalValueAtRisk(candidate).cvar;

    if (candidateCvar < best) {
      const shift = Math.max(...candidate.map((w, i) => Math.abs(w - weights[i])));
      weights = candidate;
      best = candidateCvar;
      bestWeights = candidate;
      if (shift < CONVERGENCE_TOLERANCE) break;
    } else {
      // The subgradient is only a descent direction for small enough steps, and
      // the tail set changes as the weights move, so shrink and retry.
      weights = candidate;
      step *= 0.6;
    }
  }

  return describePortfolio(bestWeights, expectedReturns, covMatrix);
}
