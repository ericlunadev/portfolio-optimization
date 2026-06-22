import { api } from '@/lib/api/client';

/**
 * Mirrors `POST /api/optimization/optimize` in `apps/api`. These endpoints
 * require an authenticated BetterAuth session, which is not yet wired into the
 * mobile app (see README "Next steps").
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

export type OptimizationResult = {
  weights: number[];
  return: number;
  volatility: number;
  success: boolean;
};

export function optimizePortfolio(payload: OptimizeRequest) {
  return api.post<OptimizationResult>('/api/optimization/optimize', payload);
}
