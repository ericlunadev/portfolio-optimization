"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useOptimizationTickers(
  tickers: string[],
  rMin: number,
  wMax: number = 1,
  startDate?: string,
  endDate?: string
) {
  return useQuery({
    queryKey: ["optimization-tickers", tickers, rMin, wMax, startDate, endDate],
    queryFn: () => api.optimizePortfolioTickers(tickers, rMin, wMax, startDate, endDate),
    enabled: tickers.length >= 2,
  });
}

export function useEfficientFrontierTickers(tickers: string[], startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ["efficient-frontier-tickers", tickers, startDate, endDate],
    queryFn: () => api.getEfficientFrontierTickers(tickers, startDate, endDate),
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
