/**
 * Number formatting helpers, mirroring the web app's `lib/utils.ts` so the two
 * clients display portfolio metrics identically. Values are stored as decimals
 * (0–1) and rendered as percentages.
 */

export function formatPercent(value: number, decimals = 2): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

export function formatNumber(value: number, decimals = 2): string {
  return value.toFixed(decimals);
}
