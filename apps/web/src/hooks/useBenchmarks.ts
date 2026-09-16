"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type CustomBenchmarkComponent } from "@/lib/api";

const CATALOG_KEY = ["benchmark-catalog"];

/**
 * The built-in half of the catalog is static per deploy, but the user's own
 * benchmarks come back in the same response, so it is invalidated on every
 * change to those rather than cached for the session.
 */
export function useBenchmarkCatalog() {
  return useQuery({
    queryKey: CATALOG_KEY,
    queryFn: () => api.getBenchmarkCatalog(),
    staleTime: Infinity,
  });
}

interface CustomBenchmarkInput {
  name: string;
  components: CustomBenchmarkComponent[];
}

/**
 * Both the catalog (which lists them for the picker) and any open comparison
 * (which may be drawing one) go stale when a custom benchmark changes.
 */
function useCustomBenchmarkMutation<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CATALOG_KEY });
      queryClient.invalidateQueries({ queryKey: ["benchmark-comparison"] });
    },
  });
}

export function useCreateCustomBenchmark() {
  return useCustomBenchmarkMutation((input: CustomBenchmarkInput) =>
    api.createCustomBenchmark(input)
  );
}

export function useUpdateCustomBenchmark() {
  return useCustomBenchmarkMutation(
    ({ id, ...input }: CustomBenchmarkInput & { id: string }) =>
      api.updateCustomBenchmark(id, input)
  );
}

export function useDeleteCustomBenchmark() {
  return useCustomBenchmarkMutation((id: string) => api.deleteCustomBenchmark(id));
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
