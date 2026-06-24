/**
 * Tiny, dependency-free scale + tick helpers for the SVG charts. Mirrors the
 * subset of d3-scale behaviour the charts need (linear domain→range mapping and
 * "nice" axis ticks) without pulling in a charting library.
 */

/** Maps a value from a numeric domain onto a pixel range (linear). */
export function linearScale(
  domainMin: number,
  domainMax: number,
  rangeMin: number,
  rangeMax: number,
): (value: number) => number {
  const domainSpan = domainMax - domainMin;
  if (domainSpan === 0) {
    // Degenerate domain (all values equal): pin to the range midpoint.
    const mid = (rangeMin + rangeMax) / 2;
    return () => mid;
  }
  const ratio = (rangeMax - rangeMin) / domainSpan;
  return (value: number) => rangeMin + (value - domainMin) * ratio;
}

/** Pads a [min, max] domain by a fraction of its span so points aren't on the edge. */
export function padDomain(min: number, max: number, fraction = 0.08): [number, number] {
  if (min === max) {
    const pad = Math.abs(min) * fraction || 0.01;
    return [min - pad, max + pad];
  }
  const pad = (max - min) * fraction;
  return [min - pad, max + pad];
}

/** Rounds to a "nice" number (1/2/5 × 10^n), for readable axis steps. */
function niceNum(range: number, round: boolean): number {
  if (range === 0) return 0;
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / 10 ** exponent;
  let niceFraction: number;
  if (round) {
    niceFraction = fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10;
  } else {
    niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  }
  return niceFraction * 10 ** exponent;
}

/** Evenly-spaced "nice" tick values covering [min, max]. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) return [min];
  const range = niceNum(max - min, false);
  const step = niceNum(range / Math.max(1, count - 1), true);
  if (step === 0) return [min, max];
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  // Guard against floating-point drift producing a runaway loop.
  for (let v = niceMin; v <= niceMax + step / 2 && ticks.length < 20; v += step) {
    ticks.push(Number(v.toFixed(10)));
  }
  return ticks;
}
