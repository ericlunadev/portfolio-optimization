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

/**
 * Renders a USD amount given in minor units (cents), mirroring the web app's
 * `formatUsdCents` so credit prices read identically across clients.
 */
export function formatUsdCents(cents: number, decimals = 2): string {
  return `$${(cents / 100).toFixed(decimals)} USD`;
}

/**
 * Formats a date as DD/MM/YYYY, the project-wide display format (see
 * `CLAUDE.md`). Accepts an ISO string or `Date`.
 */
export function formatDate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}
