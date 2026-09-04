/**
 * Every optimization strategy the API accepts, in the order the clients offer
 * them: the six mean-variance strategies that walk the efficient frontier
 * first, then the six risk-based allocators that ignore expected returns.
 *
 * The clients keep their own copy of this list because they also carry labels
 * and per-strategy form inputs; this one is the authority on what the API will
 * accept, and the `switch` in the optimize route is exhaustive against it.
 */
export const OPTIMIZATION_STRATEGIES = [
  "max-sharpe",
  "min-risk",
  "max-return",
  "target-return",
  "target-risk",
  "knee-point",
  "risk-parity",
  "black-litterman",
  "hrp",
  "max-diversification",
  "cvar",
  "equal-weight",
] as const;

export type OptimizationStrategy = (typeof OPTIMIZATION_STRATEGIES)[number];
