"use client";

import { useQuery } from "@tanstack/react-query";
import { api, OptimizationStrategy } from "@/lib/api";

export function useOptimization(
  tickers: string[],
  strategy: OptimizationStrategy,
  options: {
    wMax?: number;
    riskFreeRate?: number;
    targetReturn?: number;
    targetRisk?: number;
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
      options.riskFreeRate,
      options.targetReturn,
      options.targetRisk,
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

export function useEfficientFrontierTickers(
  tickers: string[],
  startDate?: string,
  endDate?: string,
  enforceFullInvestment: boolean = true,
  allowShortSelling: boolean = false,
  maxLeverage: number = 1.0
) {
  return useQuery({
    queryKey: [
      "efficient-frontier-tickers",
      tickers,
      startDate,
      endDate,
      enforceFullInvestment,
      allowShortSelling,
      maxLeverage,
    ],
    queryFn: () =>
      api.getEfficientFrontierTickers(tickers, startDate, endDate, enforceFullInvestment, allowShortSelling, maxLeverage),
    enabled: tickers.length >= 2,
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

export function useNegReturnProbability(rAnn: number, volAnn: number, months: number = 36) {
  return useQuery({
    queryKey: ["neg-return-prob", rAnn, volAnn, months],
    queryFn: () => api.getNegReturnProbability(rAnn, volAnn, months),
    enabled: volAnn > 0,
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
