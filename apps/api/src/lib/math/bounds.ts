import { sum } from "./matrix.js";

/**
 * Per-asset weight bounds.
 *
 * The optimizer has always supported a single `wMax` applied to every asset.
 * Investors normally want finer control than that — "at least 5% in bonds, at
 * most 20% in any single tech name" — so every asset carries its own
 * `[lower, upper]` interval. `wMax` (and `allowShortSelling`) remain the
 * fallback for assets with no explicit bound of their own.
 */
export interface AssetBounds {
  lower: number[];
  upper: number[];
}

export interface AssetBoundsInput {
  /** Fallback upper bound for assets without an explicit maximum. */
  wMax?: number;
  /** Per-asset minimum weight, `null`/`undefined` to fall back. */
  wMinPerAsset?: (number | null | undefined)[];
  /** Per-asset maximum weight, `null`/`undefined` to fall back. */
  wMaxPerAsset?: (number | null | undefined)[];
  allowShortSelling?: boolean;
}

/**
 * Expand the bound inputs into a concrete `[lower, upper]` pair per asset.
 *
 * An asset with no explicit bound gets `[0, wMax]` (or `[-wMax, wMax]` when
 * short selling is allowed). An upper bound below its own lower bound is
 * raised to meet it, so the interval is never empty.
 */
export function resolveAssetBounds(n: number, input: AssetBoundsInput = {}): AssetBounds {
  const { wMax = 1.0, wMinPerAsset, wMaxPerAsset, allowShortSelling = false } = input;
  const defaultLower = allowShortSelling ? -wMax : 0;

  const lower: number[] = [];
  const upper: number[] = [];

  for (let i = 0; i < n; i++) {
    const lo = numberOr(wMinPerAsset?.[i], defaultLower);
    const hi = Math.max(lo, numberOr(wMaxPerAsset?.[i], wMax));
    lower.push(lo);
    upper.push(hi);
  }

  return { lower, upper };
}

function numberOr(value: number | null | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
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
export function projectOntoBounded(
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

export interface BoundsFeasibility {
  feasible: boolean;
  /** Smallest total weight the bounds allow. */
  minTotal: number;
  /** Largest total weight the bounds allow. */
  maxTotal: number;
}

/**
 * Check whether a portfolio summing to `target` can satisfy the bounds.
 *
 * With `enforceEquality` the total must land exactly on `target`, so the target
 * has to sit inside `[sum(lower), sum(upper)]`. Without it the total only has
 * to stay at or below `target`, so `sum(lower) <= target` suffices.
 */
export function checkBoundsFeasibility(
  bounds: AssetBounds,
  target: number,
  enforceEquality: boolean = true
): BoundsFeasibility {
  const minTotal = bounds.lower.reduce((a, b) => a + b, 0);
  const maxTotal = bounds.upper.reduce((a, b) => a + b, 0);
  const feasible = enforceEquality
    ? minTotal <= target + 1e-9 && maxTotal >= target - 1e-9
    : minTotal <= target + 1e-9;

  return { feasible, minTotal, maxTotal };
}

/** The snake_case bound fields shared by every optimization request body. */
export interface BoundsRequest {
  tickers: string[];
  w_max: number;
  w_min_per_asset?: (number | null)[];
  w_max_per_asset?: (number | null)[];
  allow_short_selling?: boolean;
  enforce_full_investment?: boolean;
  max_leverage?: number;
}

/**
 * Reject weight bounds that no portfolio could satisfy. Routes run this before
 * metering: an impossible floor/cap combination is a client mistake, not a
 * failed computation, so the user should not be charged for it.
 *
 * Returns an error payload, or `null` when the bounds are satisfiable.
 */
export function validateAssetBounds(
  body: BoundsRequest
): { error: string; detail: string } | null {
  const {
    tickers,
    w_max,
    w_min_per_asset,
    w_max_per_asset,
    allow_short_selling = false,
    enforce_full_investment = true,
    max_leverage = 1.0,
  } = body;

  for (const [name, list] of [
    ["w_min_per_asset", w_min_per_asset],
    ["w_max_per_asset", w_max_per_asset],
  ] as const) {
    if (list && list.length !== tickers.length) {
      return {
        error: "bounds_length_mismatch",
        detail: `${name} must have one entry per ticker (${tickers.length}).`,
      };
    }
  }

  if (!allow_short_selling && w_min_per_asset?.some((v) => v !== null && v < 0)) {
    return {
      error: "negative_min_weight",
      detail: "A negative minimum weight requires short selling to be allowed.",
    };
  }

  for (let i = 0; i < tickers.length; i++) {
    const lo = w_min_per_asset?.[i];
    const hi = w_max_per_asset?.[i];
    if (lo != null && hi != null && lo > hi + 1e-9) {
      return {
        error: "min_above_max",
        detail: `Minimum weight for ${tickers[i]} is above its maximum weight.`,
      };
    }
    if (lo != null && lo > max_leverage + 1e-9) {
      return {
        error: "min_above_total",
        detail: `Minimum weight for ${tickers[i]} exceeds the total portfolio weight.`,
      };
    }
  }

  const bounds = resolveAssetBounds(tickers.length, {
    wMax: w_max,
    wMinPerAsset: w_min_per_asset,
    wMaxPerAsset: w_max_per_asset,
    allowShortSelling: allow_short_selling,
  });
  const { feasible, minTotal, maxTotal } = checkBoundsFeasibility(
    bounds,
    max_leverage,
    enforce_full_investment
  );

  if (!feasible) {
    return minTotal > max_leverage
      ? {
          error: "min_weights_exceed_total",
          detail: `Minimum weights sum to ${(minTotal * 100).toFixed(1)}%, above the ${(max_leverage * 100).toFixed(0)}% to allocate.`,
        }
      : {
          error: "max_weights_below_total",
          detail: `Maximum weights sum to ${(maxTotal * 100).toFixed(1)}%, below the ${(max_leverage * 100).toFixed(0)}% to allocate.`,
        };
  }

  return null;
}
