"use client";

import { useQuery } from "@tanstack/react-query";
import { api, OptimizationStrategy } from "@/lib/api";

export function useOptimization(
  tickers: string[],
  strategy: OptimizationStrategy,
  options: {
    wMax?: number;
    wMinPerAsset?: (number | null)[];
    wMaxPerAsset?: (number | null)[];
    riskFreeRate?: number;
    targetReturn?: number;
    targetRisk?: number;
    cvarConfidence?: number;
    viewConfidence?: number;
    startDate?: string;
    endDate?: string;
    enforceFullInvestment?: boolean;
    allowShortSelling?: boolean;
    maxLeverage?: number;
  } = {}
) {
  return useQuery({
    queryKey: [
      "optimization",
      tickers,
      strategy,
      options.wMax,
      options.wMinPerAsset,
      options.wMaxPerAsset,
      options.riskFreeRate,
      options.targetReturn,
      options.targetRisk,
      options.cvarConfidence,
      options.viewConfidence,
      options.startDate,
      options.endDate,
      options.enforceFullInvestment,
      options.allowShortSelling,
      options.maxLeverage,
    ],
    queryFn: () => api.optimizePortfolio(tickers, strategy, options),
    enabled: tickers.length >= 2,
  });
}

export function useOptimizationTickers(
  tickers: string[],
  rMin: number,
  wMax: number = 1,
  startDate?: string,
  endDate?: string,
  enforceFullInvestment: boolean = true,
  allowShortSelling: boolean = false
) {
  return useQuery({
    queryKey: [
      "optimization-tickers",
      tickers,
      rMin,
      wMax,
      startDate,
      endDate,
      enforceFullInvestment,
      allowShortSelling,
    ],
    queryFn: () =>
      api.optimizePortfolioTickers(
        tickers,
        rMin,
        wMax,
        startDate,
        endDate,
        enforceFullInvestment,
        allowShortSelling
      ),
    enabled: tickers.length >= 2,
  });
}

export function useMaxSharpeOptimization(
  tickers: string[],
  wMax: number = 1,
  riskFreeRate: number = 0,
  startDate?: string,
  endDate?: string,
  enforceFullInvestment: boolean = true,
  allowShortSelling: boolean = false
) {
  return useQuery({
    queryKey: [
      "max-sharpe-tickers",
      tickers,
      wMax,
      riskFreeRate,
      startDate,
      endDate,
      enforceFullInvestment,
      allowShortSelling,
    ],
    queryFn: () =>
      api.getMaxSharpePortfolioTickers(
        tickers,
        wMax,
        riskFreeRate,
        startDate,
        endDate,
        enforceFullInvestment,
        allowShortSelling
      ),
    enabled: tickers.length >= 2,
  });
}

/**
 * A saved simulation's efficient frontier.
 *
 * The API derives the request from the stored simulation, so `inputs` only
 * keys the cache: when a re-run changes the stored parameters, the key changes
 * and the new frontier is fetched (and charged, being new work). Reopening the
 * same simulation is free on the API side, so a refetch costs nothing.
 */
export function useSavedSimulationFrontier(
  simulationId: string,
  inputs: {
    tickers: string[];
    startDate: string;
    endDate: string;
    enforceFullInvestment: boolean;
    allowShortSelling: boolean;
    maxLeverage: number;
    wMax: number;
    wMinPerAsset?: (number | null)[];
    wMaxPerAsset?: (number | null)[];
  },
  enabled: boolean
) {
  return useQuery({
    queryKey: [
      "saved-simulation-frontier",
      simulationId,
      inputs.tickers,
      inputs.startDate,
      inputs.endDate,
      inputs.enforceFullInvestment,
      inputs.allowShortSelling,
      inputs.maxLeverage,
      inputs.wMax,
      inputs.wMinPerAsset,
      inputs.wMaxPerAsset,
    ],
    queryFn: () => api.getSavedSimulationFrontier(simulationId),
    enabled: enabled && inputs.tickers.length >= 2,
  });
}

export function usePortfolioCumulativeReturnsTickers(
  tickers: string[],
  weights: number[],
  startDate?: string
) {
  return useQuery({
    queryKey: ["portfolio-cumulative-returns-tickers", tickers, weights, startDate],
    queryFn: () => api.getPortfolioCumulativeReturnsTickers(tickers, weights, startDate),
    enabled: tickers.length > 0 && weights.length === tickers.length,
  });
}

export function useRollingVolatilityTickers(
  tickers: string[],
  window: number = 252,
  startDate?: string,
  endDate?: string
) {
  return useQuery({
    queryKey: ["rolling-volatility-tickers", tickers, window, startDate, endDate],
    queryFn: () => api.getRollingVolatilityTickers(tickers, window, startDate, endDate),
    enabled: tickers.length >= 1,
  });
}
