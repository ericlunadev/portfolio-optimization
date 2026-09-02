"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** The catalog is static per deploy, so it never needs refetching in a session. */
export function useBenchmarkCatalog() {
  return useQuery({
    queryKey: ["benchmark-catalog"],
    queryFn: () => api.getBenchmarkCatalog(),
    staleTime: Infinity,
  });
}

export function useBenchmarkComparison(
  benchmarks: string[],
  tickers: string[],
  weights: number[],
  options: {
    startDate?: string;
    endDate?: string;
    riskFreeRate?: number;
  } = {}
) {
  return useQuery({
    queryKey: [
      "benchmark-comparison",
      benchmarks,
      tickers,
      weights,
      options.startDate,
      options.endDate,
      options.riskFreeRate,
    ],
    queryFn: () => api.getBenchmarkComparison(benchmarks, tickers, weights, options),
    enabled:
      benchmarks.length > 0 &&
      tickers.length > 0 &&
      weights.length === tickers.length,
  });
}
