import { SimulationAsset } from "@/lib/api";

/**
 * Per-asset weight limits.
 *
 * The form captures a minimum and maximum percentage per asset; the optimizer
 * takes decimals aligned index-for-index with the ticker list it receives. A
 * `null` entry means "no limit of its own", so the API falls back to the
 * portfolio-wide maximum weight.
 */

export interface WeightBounds {
  wMinPerAsset: (number | null)[];
  wMaxPerAsset: (number | null)[];
}

/** Rows with a ticker, in the same order the ticker list is built. */
function withTicker<T extends { ticker: string }>(assets: T[]): T[] {
  return assets.filter((a) => a.ticker);
}

function toDecimal(percent: number | null | undefined): number | null {
  return typeof percent === "number" && Number.isFinite(percent) ? percent / 100 : null;
}

/**
 * Build the bound arrays the optimization endpoints expect, or `undefined` when
 * limits are switched off or no row sets one — so an unlimited request stays
 * byte-identical to what it was before per-asset limits existed.
 */
export function toWeightBounds(
  assets: SimulationAsset[],
  assetLimits: boolean | undefined
): WeightBounds | undefined {
  if (!assetLimits) return undefined;

  const rows = withTicker(assets);
  const wMinPerAsset = rows.map((a) => toDecimal(a.minWeight));
  const wMaxPerAsset = rows.map((a) => toDecimal(a.maxWeight));

  const hasAny =
    wMinPerAsset.some((v) => v !== null) || wMaxPerAsset.some((v) => v !== null);

  return hasAny ? { wMinPerAsset, wMaxPerAsset } : undefined;
}

/**
 * Render an asset's weight limits compactly — "10–40%", "≥10%", "≤40%" — or
 * null when the asset has neither, so callers can skip the annotation.
 *
 * Pass `ascii` for the PDF export: jsPDF's built-in fonts cannot draw the
 * comparison glyphs, so it gets ">=" and "<=" instead.
 */
export function formatWeightLimits(
  asset: SimulationAsset | undefined,
  { ascii = false }: { ascii?: boolean } = {}
): string | null {
  const min = asset?.minWeight ?? null;
  const max = asset?.maxWeight ?? null;
  const dash = ascii ? "-" : "–";

  if (min !== null && max !== null) return `${trim(min)}${dash}${trim(max)}%`;
  if (min !== null) return `${ascii ? ">=" : "≥"}${trim(min)}%`;
  if (max !== null) return `${ascii ? "<=" : "≤"}${trim(max)}%`;
  return null;
}

/** 40 -> "40", 12.5 -> "12.5". */
function trim(percent: number): string {
  return String(Number(percent.toFixed(2)));
}

export type AssetLimitsError =
  | { kind: "minAboveMax"; ticker: string }
  | { kind: "outOfRange"; ticker: string }
  | { kind: "minTotalTooHigh"; total: number; target: number }
  | { kind: "maxTotalTooLow"; total: number; target: number };

export interface AssetLimitsContext {
  assetLimits: boolean | undefined;
  /** Total weight to allocate, in percent — 100 unless leverage is on. */
  targetPercent: number;
  enforceFullInvestment: boolean;
  /** Portfolio-wide cap applied to rows without a maximum of their own. */
  fallbackMaxPercent: number;
}

/**
 * Catch limits no portfolio could satisfy before the request is sent, so the
 * user is not charged a credit to be told the floors add up to more than 100%.
 * Mirrors the check the API runs.
 */
export function validateAssetLimits(
  assets: SimulationAsset[],
  context: AssetLimitsContext
): AssetLimitsError | null {
  const { assetLimits, targetPercent, enforceFullInvestment, fallbackMaxPercent } = context;
  if (!assetLimits) return null;

  const rows = withTicker(assets);
  if (rows.length === 0) return null;

  let minTotal = 0;
  let maxTotal = 0;

  for (const asset of rows) {
    const min = asset.minWeight ?? null;
    const max = asset.maxWeight ?? null;

    if ((min !== null && (min < 0 || min > 100)) || (max !== null && (max < 0 || max > 100))) {
      return { kind: "outOfRange", ticker: asset.ticker };
    }
    if (min !== null && max !== null && min > max) {
      return { kind: "minAboveMax", ticker: asset.ticker };
    }

    minTotal += min ?? 0;
    maxTotal += max ?? fallbackMaxPercent;
  }

  if (minTotal > targetPercent + 0.01) {
    return { kind: "minTotalTooHigh", total: minTotal, target: targetPercent };
  }
  if (enforceFullInvestment && maxTotal < targetPercent - 0.01) {
    return { kind: "maxTotalTooLow", total: maxTotal, target: targetPercent };
  }

  return null;
}
