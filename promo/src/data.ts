import { rng } from "./motion";

// Illustrative numbers for the demo. They are internally consistent — the
// frontier, its max-Sharpe point and the risk metrics come from one model — so
// the same portfolio reads the same in every scene.

export const TICKERS = ["MELI", "AAPL", "GGAL", "YPF", "SPY", "KO"] as const;

export const RISK_FREE = 0.04;

/** Efficient-frontier hyperbola: volatility needed for a given expected return. */
const SIGMA_MIN = 0.11;
const MU_AT_MIN = 0.12;
const CURVATURE = 0.9;
export const sigmaFor = (mu: number) => Math.sqrt(SIGMA_MIN ** 2 + CURVATURE * (mu - MU_AT_MIN) ** 2);

export const FRONTIER_MU: [number, number] = [0.02, 0.36];

/** Max-Sharpe point: the tangent from the risk-free rate, found by scan. */
export const MAX_SHARPE = (() => {
  let best = { mu: MU_AT_MIN, sigma: SIGMA_MIN, sharpe: 0 };
  for (let mu = MU_AT_MIN; mu <= FRONTIER_MU[1]; mu += 0.0005) {
    const sigma = sigmaFor(mu);
    const sharpe = (mu - RISK_FREE) / sigma;
    if (sharpe > best.sharpe) best = { mu, sigma, sharpe };
  }
  return best;
})();

/** Random long-only portfolios, all inside the frontier. */
export const CLOUD = (() => {
  const r = rng(7);
  return Array.from({ length: 170 }, () => {
    const mu = 0.03 + r() * 0.29;
    const spread = Math.pow(r(), 1.6) * 0.17 + 0.006;
    return { mu, sigma: sigmaFor(mu) + spread };
  });
})();

/** Weights each highlighted strategy assigns (sum to 100). */
export const STRATEGY_WEIGHTS: Record<string, number[]> = {
  sharpe: [31, 24, 18, 15, 8, 4],
  minRisk: [9, 14, 6, 7, 30, 34],
  parity: [15, 17, 12, 14, 20, 22],
};

/** Monthly cumulative-return paths from 01/01/2022 to 01/01/2026. */
const MONTHS = 48;
const walk = (seed: number, drift: number, vol: number) => {
  const r = rng(seed);
  let value = 1;
  const out = [0];
  for (let i = 1; i <= MONTHS; i++) {
    const shock = (r() + r() + r() - 1.5) * vol;
    value *= 1 + drift + shock;
    out.push(value - 1);
  }
  return out;
};
export const SERIES = {
  portfolio: walk(11, 0.0155, 0.07),
  sp500: walk(5, 0.0088, 0.06),
  custom: walk(23, 0.011, 0.075),
};
export const SERIES_MONTHS = MONTHS;

/**
 * Drawdown of a weekly path calibrated to the max-Sharpe portfolio's own
 * return and volatility, so the depth matches the volatility card beside it.
 */
export const DRAWDOWN_WEEKS = 208;
export const DRAWDOWN = (() => {
  const r = rng(41);
  const drift = MAX_SHARPE.mu / 52;
  const vol = MAX_SHARPE.sigma / Math.sqrt(52);
  let level = 1;
  let peak = 1;
  const out = [0];
  for (let i = 1; i <= DRAWDOWN_WEEKS; i++) {
    // Sum of uniforms ≈ normal; scaled to unit variance.
    const z = (r() + r() + r() + r() - 2) * Math.sqrt(3);
    level *= 1 + drift + vol * z;
    peak = Math.max(peak, level);
    out.push(level / peak - 1);
  }
  return out;
})();
export const MAX_DRAWDOWN = Math.min(...DRAWDOWN);

/** Probability of a negative 12-month return under a normal model. */
export const PROB_LOSS = (() => {
  const z = -MAX_SHARPE.mu / MAX_SHARPE.sigma;
  // Abramowitz–Stegun approximation of the normal CDF.
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const tail = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - tail : tail;
})();
