import { useState } from 'react';

import type { OptimizationStrategy, OptimizeRequest } from '@/lib/api/optimization';
import { strategyParam } from '@/lib/optimizer/strategies';

const MIN_TICKERS = 2;

/** Parse a user-entered percentage string ("2.5") into a decimal (0.025). */
function percentToDecimal(value: string): number {
  return Number(value) / 100;
}

function isValidNumber(value: string): boolean {
  return value.trim() !== '' && !Number.isNaN(Number(value));
}

/**
 * Owns all optimizer form state so it survives the form ⇆ results toggle in the
 * screen. Exposes validity and a `buildRequest()` that maps the UI fields onto
 * the `POST /api/optimization/optimize` payload (percentages → decimals, only
 * the parameter relevant to the chosen strategy).
 */
export function useOptimizerForm() {
  const [tickers, setTickers] = useState<string[]>([]);
  const [strategy, setStrategy] = useState<OptimizationStrategy>('max-sharpe');
  const [riskFreeRate, setRiskFreeRate] = useState('0');
  const [targetReturn, setTargetReturn] = useState('');
  const [targetRisk, setTargetRisk] = useState('');
  const [enforceFullInvestment, setEnforceFullInvestment] = useState(true);
  const [allowShortSelling, setAllowShortSelling] = useState(false);

  const param = strategyParam(strategy);

  const hasEnoughTickers = tickers.length >= MIN_TICKERS;
  const paramValid =
    param === 'target_return'
      ? isValidNumber(targetReturn)
      : param === 'target_risk'
        ? isValidNumber(targetRisk)
        : true;
  const isValid = hasEnoughTickers && paramValid;

  function buildRequest(): OptimizeRequest {
    return {
      tickers,
      strategy,
      ...(param === 'risk_free_rate'
        ? { risk_free_rate: percentToDecimal(riskFreeRate || '0') }
        : {}),
      ...(param === 'target_return' ? { target_return: percentToDecimal(targetReturn) } : {}),
      ...(param === 'target_risk' ? { target_risk: percentToDecimal(targetRisk) } : {}),
      enforce_full_investment: enforceFullInvestment,
      allow_short_selling: allowShortSelling,
    };
  }

  function addTicker(symbol: string) {
    const normalized = symbol.trim().toUpperCase();
    if (normalized && !tickers.includes(normalized)) {
      setTickers([...tickers, normalized]);
    }
  }

  function removeTicker(symbol: string) {
    setTickers(tickers.filter((t) => t !== symbol));
  }

  return {
    tickers,
    addTicker,
    removeTicker,
    strategy,
    setStrategy,
    param,
    riskFreeRate,
    setRiskFreeRate,
    targetReturn,
    setTargetReturn,
    targetRisk,
    setTargetRisk,
    enforceFullInvestment,
    setEnforceFullInvestment,
    allowShortSelling,
    setAllowShortSelling,
    hasEnoughTickers,
    isValid,
    buildRequest,
  };
}

export type OptimizerForm = ReturnType<typeof useOptimizerForm>;
