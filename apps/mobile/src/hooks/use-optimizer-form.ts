import { useState } from 'react';

import type { OptimizationStrategy, OptimizeRequest } from '@/lib/api/optimization';
import { strategyParam } from '@/lib/optimizer/strategies';

const MIN_TICKERS = 2;
const MIN_LEVERAGE = 1;
const MAX_LEVERAGE = 3;

/** Parse a user-entered percentage string ("2.5") into a decimal (0.025). */
function percentToDecimal(value: string): number {
  return Number(value) / 100;
}

function isValidNumber(value: string): boolean {
  return value.trim() !== '' && !Number.isNaN(Number(value));
}

/** Zero-padded `YYYY-MM-01` for the first day of the given month. */
function toStartOfMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

/** Zero-padded `YYYY-MM-DD` for the last day of the given month. */
function toEndOfMonth(year: number, month: number): string {
  // `new Date(year, month, 0)` rolls back to the last day of `month` (1-based).
  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

/** Comparable integer key (YYYYMM) so start/end can be ordered cheaply. */
function monthKey(year: number, month: number): number {
  return year * 100 + month;
}

/**
 * Owns all optimizer form state so it survives the form ⇆ results toggle in the
 * screen. Exposes validity and a `buildRequest()` that maps the UI fields onto
 * the `POST /api/optimization/optimize` payload (percentages → decimals, ISO
 * dates, only the parameter relevant to the chosen strategy).
 */
export function useOptimizerForm() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [tickers, setTickers] = useState<string[]>([]);
  const [strategy, setStrategy] = useState<OptimizationStrategy>('max-sharpe');
  const [riskFreeRate, setRiskFreeRate] = useState('0');
  const [targetReturn, setTargetReturn] = useState('');
  const [targetRisk, setTargetRisk] = useState('');
  const [enforceFullInvestment, setEnforceFullInvestment] = useState(true);
  const [allowShortSelling, setAllowShortSelling] = useState(false);

  // Date range — optional analysis window. Defaults to the last ~5 years; only
  // sent to the API when `useDateRange` is on (otherwise the API uses full
  // history, the current behaviour).
  const [useDateRange, setUseDateRange] = useState(false);
  const [startMonth, setStartMonth] = useState(1);
  const [startYear, setStartYear] = useState(currentYear - 5);
  const [endMonth, setEndMonth] = useState(currentMonth);
  const [endYear, setEndYear] = useState(currentYear);

  // Leverage — when off, no `max_leverage` is sent (API defaults to 1).
  const [useLeverage, setUseLeverage] = useState(false);
  const [maxLeverage, setMaxLeverage] = useState('1.5');

  // Per-asset weight cap — when off, no `w_max` is sent (API defaults to 1).
  const [useAssetConstraints, setUseAssetConstraints] = useState(false);
  const [maxWeightPerAsset, setMaxWeightPerAsset] = useState('40');

  const param = strategyParam(strategy);

  const hasEnoughTickers = tickers.length >= MIN_TICKERS;
  const paramValid =
    param === 'target_return'
      ? isValidNumber(targetReturn)
      : param === 'target_risk'
        ? isValidNumber(targetRisk)
        : true;

  // Date range is invalid only when enabled and start is after end.
  const dateRangeInvalid =
    useDateRange && monthKey(startYear, startMonth) > monthKey(endYear, endMonth);

  // Leverage must parse to a number within [1, 3] when enabled.
  const leverageValue = Number(maxLeverage);
  const leverageValid =
    !useLeverage ||
    (isValidNumber(maxLeverage) &&
      leverageValue >= MIN_LEVERAGE &&
      leverageValue <= MAX_LEVERAGE);

  // w_max is entered as a percent; the decimal must land in (0, 1].
  const wMaxValue = percentToDecimal(maxWeightPerAsset);
  const assetConstraintsValid =
    !useAssetConstraints ||
    (isValidNumber(maxWeightPerAsset) && wMaxValue > 0 && wMaxValue <= 1);

  const isValid =
    hasEnoughTickers &&
    paramValid &&
    !dateRangeInvalid &&
    leverageValid &&
    assetConstraintsValid;

  function buildRequest(): OptimizeRequest {
    return {
      tickers,
      strategy,
      ...(param === 'risk_free_rate'
        ? { risk_free_rate: percentToDecimal(riskFreeRate || '0') }
        : {}),
      ...(param === 'target_return' ? { target_return: percentToDecimal(targetReturn) } : {}),
      ...(param === 'target_risk' ? { target_risk: percentToDecimal(targetRisk) } : {}),
      ...(useDateRange
        ? {
            start_date: toStartOfMonth(startYear, startMonth),
            end_date: toEndOfMonth(endYear, endMonth),
          }
        : {}),
      ...(useLeverage ? { max_leverage: leverageValue } : {}),
      ...(useAssetConstraints ? { w_max: wMaxValue } : {}),
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
    // Date range
    useDateRange,
    setUseDateRange,
    startMonth,
    setStartMonth,
    startYear,
    setStartYear,
    endMonth,
    setEndMonth,
    endYear,
    setEndYear,
    dateRangeInvalid,
    // Leverage
    useLeverage,
    setUseLeverage,
    maxLeverage,
    setMaxLeverage,
    // Per-asset weight cap
    useAssetConstraints,
    setUseAssetConstraints,
    maxWeightPerAsset,
    setMaxWeightPerAsset,
    hasEnoughTickers,
    isValid,
    buildRequest,
  };
}

export type OptimizerForm = ReturnType<typeof useOptimizerForm>;
