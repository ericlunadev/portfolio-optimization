import type { OptimizationStrategy } from '@/lib/api/optimization';

/**
 * The extra parameter a strategy needs from the user, if any. Drives which
 * conditional input the optimizer form shows.
 */
export type StrategyParam = 'risk_free_rate' | 'target_return' | 'target_risk' | null;

export type StrategyConfig = {
  value: OptimizationStrategy;
  param: StrategyParam;
};

/**
 * Strategies offered in the optimizer, in display order. Labels and
 * descriptions live in the `optimizer.strategies.<value>` i18n keys.
 */
export const STRATEGIES: StrategyConfig[] = [
  { value: 'max-sharpe', param: 'risk_free_rate' },
  { value: 'min-risk', param: null },
  { value: 'max-return', param: null },
  { value: 'target-return', param: 'target_return' },
  { value: 'target-risk', param: 'target_risk' },
  { value: 'knee-point', param: null },
];

export function strategyParam(strategy: OptimizationStrategy): StrategyParam {
  return STRATEGIES.find((s) => s.value === strategy)?.param ?? null;
}
