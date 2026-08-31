/**
 * Per-asset weight limits.
 *
 * The form captures a minimum and maximum percentage per ticker as free text;
 * `POST /api/optimization/optimize` takes decimals in two arrays aligned
 * index-for-index with `tickers`. A `null` entry means "no limit of its own",
 * so the API falls back to the portfolio-wide `w_max`.
 *
 * Mirrors the rules in `apps/web/src/lib/asset-limits.ts` and the server-side
 * check in `apps/api/src/lib/math/bounds.ts`.
 */

/** Raw text for one ticker's limits, as typed. */
export type AssetLimit = { min: string; max: string };

export type AssetLimits = Record<string, AssetLimit>;

export const EMPTY_LIMIT: AssetLimit = { min: '', max: '' };

/** Parse a percentage field; blank or unparseable means "no limit". */
export function parsePercent(value: string | undefined): number | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export type AssetLimitsBounds = {
  w_min_per_asset: (number | null)[];
  w_max_per_asset: (number | null)[];
};

/**
 * Build the two bound arrays, or `undefined` when limits are off or no ticker
 * sets one — so an unlimited request stays exactly what it was before.
 */
export function toWeightBounds(
  tickers: string[],
  limits: AssetLimits,
  enabled: boolean,
): AssetLimitsBounds | undefined {
  if (!enabled) return undefined;

  const toDecimal = (v: number | null) => (v === null ? null : v / 100);
  const w_min_per_asset = tickers.map((t) => toDecimal(parsePercent(limits[t]?.min)));
  const w_max_per_asset = tickers.map((t) => toDecimal(parsePercent(limits[t]?.max)));

  const hasAny =
    w_min_per_asset.some((v) => v !== null) || w_max_per_asset.some((v) => v !== null);

  return hasAny ? { w_min_per_asset, w_max_per_asset } : undefined;
}

export type AssetLimitsError =
  | { kind: 'minAboveMax'; ticker: string }
  | { kind: 'outOfRange'; ticker: string }
  | { kind: 'minTotalTooHigh'; total: string; target: string }
  | { kind: 'maxTotalTooLow'; total: string; target: string };

type ValidateContext = {
  enabled: boolean;
  /** Total weight to allocate, in percent — 100 unless leverage is on. */
  targetPercent: number;
  enforceFullInvestment: boolean;
  /** Portfolio-wide cap applied to tickers with no maximum of their own. */
  fallbackMaxPercent: number;
};

/**
 * Catch limits no portfolio could satisfy before the request is sent, so the
 * user is not charged a credit to be told the floors add up to more than 100%.
 */
export function validateAssetLimits(
  tickers: string[],
  limits: AssetLimits,
  { enabled, targetPercent, enforceFullInvestment, fallbackMaxPercent }: ValidateContext,
): AssetLimitsError | null {
  if (!enabled || tickers.length === 0) return null;

  let minTotal = 0;
  let maxTotal = 0;

  for (const ticker of tickers) {
    const min = parsePercent(limits[ticker]?.min);
    const max = parsePercent(limits[ticker]?.max);

    if ((min !== null && (min < 0 || min > 100)) || (max !== null && (max < 0 || max > 100))) {
      return { kind: 'outOfRange', ticker };
    }
    if (min !== null && max !== null && min > max) {
      return { kind: 'minAboveMax', ticker };
    }

    minTotal += min ?? 0;
    maxTotal += max ?? fallbackMaxPercent;
  }

  if (minTotal > targetPercent + 0.01) {
    return {
      kind: 'minTotalTooHigh',
      total: minTotal.toFixed(1),
      target: targetPercent.toFixed(0),
    };
  }
  if (enforceFullInvestment && maxTotal < targetPercent - 0.01) {
    return {
      kind: 'maxTotalTooLow',
      total: maxTotal.toFixed(1),
      target: targetPercent.toFixed(0),
    };
  }

  return null;
}
