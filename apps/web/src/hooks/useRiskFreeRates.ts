"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

/**
 * Current yields for the reference instruments offered as risk-free rate
 * presets. The API caches these for an hour, so the client keeps them fresh
 * for the same window rather than refetching on every mount.
 */
export function useRiskFreeRates() {
  return useQuery({
    queryKey: ["risk-free-rates"],
    queryFn: () => api.getRiskFreeRates(),
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
}
