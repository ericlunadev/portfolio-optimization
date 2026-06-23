import { api } from '@/lib/api/client';

/**
 * Mirrors `POST /api/optimization/optimize` in `apps/api`. These endpoints
 * require an authenticated BetterAuth session; the session cookie is attached
 * automatically by the API client (`src/lib/api/client.ts`) once the user has
 * signed in via the optimizer screen.
 */

export type OptimizationStrategy =
  | 'max-sharpe'
  | 'min-risk'
  | 'max-return'
  | 'target-return'
  | 'target-risk'
  | 'knee-point';

export type OptimizeRequest = {
  tickers: string[];
  strategy: OptimizationStrategy;
  w_max?: number;
  risk_free_rate?: number;
  target_return?: number;
  target_risk?: number;
  start_date?: string;
  end_date?: string;
  enforce_full_investment?: boolean;
  allow_short_selling?: boolean;
  max_leverage?: number;
};

/** Per-asset allocation row returned by the optimizer. */
export type OptimizationWeight = {
  fund_id: number;
  fund_name: string;
  /** Allocation as a fraction of the portfolio (0–1). */
  weight: number;
  /** Annualized expected return for the asset (0–1). */
  exp_ret: number;
  /** Annualized volatility for the asset (0–1). */
  volatility: number;
};

/** Risk statistics derived from the optimal portfolio's return/volatility. */
export type OptimizationStats = {
  ci_95_low: number;
  ci_95_high: number;
  prob_neg_1m: number;
  prob_neg_3m: number;
  prob_neg_1y: number;
  prob_neg_2y: number;
};

export type OptimizationResult = {
  weights: OptimizationWeight[];
  expected_return: number;
  volatility: number;
  sharpe_ratio: number;
  strategy: OptimizationStrategy;
  stats: OptimizationStats;
};

export function optimizePortfolio(payload: OptimizeRequest) {
  return api.post<OptimizationResult>('/api/optimization/optimize', payload);
}
