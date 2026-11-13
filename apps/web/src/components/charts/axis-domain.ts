/**
 * Axis ranges that frame a set of values instead of reaching back to zero.
 *
 * The efficient frontier usually spans a narrow band of risk and return a long
 * way from the origin (local equities quoted in pesos sit at 40%+ volatility).
 * Anchored at zero, that band collapses into a short, almost straight stub in
 * one corner and the curvature — the whole point of the chart — disappears.
 */

export interface FittedDomain {
  domain: [number, number];
  ticks: number[];
}

/** Fraction of the data's span added as breathing room on each side. */
const PADDING = 0.08;
/** Roughly how many intervals the axis should be split into. */
const TARGET_INTERVALS = 5;

/**
 * A 1, 2 or 5 × 10ⁿ step close to `raw`. Steps of 2.5 are left out on purpose:
 * axis labels print at most one decimal of a percentage, so 0.25% would round.
 */
function niceStep(raw: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / magnitude;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * magnitude;
}

/** Strips float noise such as 0.30000000000000004 from computed ticks. */
function clean(value: number): number {
  return Number(value.toPrecision(12));
}

/**
 * Fits a padded, round-numbered range around `values`. The range never dips
 * below zero unless a value does, so volatility can't show negative ticks.
 */
export function fitDomain(values: number[]): FittedDomain | null {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return null;

  const min = Math.min(...finite);
  const max = Math.max(...finite);
  // A single point (or a flat line) still needs a visible span around it.
  const span = max - min || Math.abs(max) * 0.1 || 0.01;

  let lo = min - span * PADDING;
  const hi = max + span * PADDING;
  if (min >= 0 && lo < 0) lo = 0;

  const step = niceStep((hi - lo) / TARGET_INTERVALS);
  const start = clean(Math.floor(lo / step) * step);
  const end = clean(Math.ceil(hi / step) * step);

  const ticks: number[] = [];
  for (let i = 0; start + i * step <= end + step / 2; i++) {
    ticks.push(clean(start + i * step));
  }

  return { domain: [start, end], ticks };
}
