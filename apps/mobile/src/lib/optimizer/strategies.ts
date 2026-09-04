import type { OptimizationStrategy } from '@/lib/api/optimization';

/**
 * The extra parameters a strategy needs from the user, named after the request
 * fields they fill. Drives which conditional inputs the optimizer form shows.
 * Black-Litterman needs two, so this is a list rather than a single value.
 */
export type StrategyParam =
  | 'risk_free_rate'
  | 'target_return'
  | 'target_risk'
  | 'cvar_confidence'
  | 'view_confidence';

export type StrategyConfig = {
  value: OptimizationStrategy;
  params: StrategyParam[];
};

/**
 * Strategies offered in the optimizer, in display order: the six that walk the
 * mean-variance efficient frontier first, then the six that size positions from
 * risk alone. Labels and descriptions live in the `optimizer.strategies.<value>`
 * i18n keys.
 */
export const STRATEGIES: StrategyConfig[] = [
  { value: 'max-sharpe', params: ['risk_free_rate'] },
  { value: 'min-risk', params: [] },
  { value: 'max-return', params: [] },
  { value: 'target-return', params: ['target_return'] },
  { value: 'target-risk', params: ['target_risk'] },
  { value: 'knee-point', params: [] },
  { value: 'risk-parity', params: [] },
  { value: 'black-litterman', params: ['risk_free_rate', 'view_confidence'] },
  { value: 'hrp', params: [] },
  { value: 'max-diversification', params: [] },
  { value: 'cvar', params: ['cvar_confidence'] },
  { value: 'equal-weight', params: [] },
];

/** Whether a strategy reads a given input. */
export function strategyUsesParam(
  strategy: OptimizationStrategy,
  param: StrategyParam
): boolean {
  return STRATEGIES.find((s) => s.value === strategy)?.params.includes(param) ?? false;
}
