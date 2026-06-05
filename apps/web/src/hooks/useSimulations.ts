"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  api,
  SimulationParams,
  OptimizationResultWithStrategy,
  SimulationListItem,
} from "@/lib/api";

export function useSimulations(enabled: boolean = true) {
  return useQuery({
    queryKey: ["simulations"],
    queryFn: () => api.listSimulations(),
    enabled,
  });
}

export function useSimulation(id: string | null) {
  return useQuery({
    queryKey: ["simulation", id],
    queryFn: () => api.getSimulation(id!),
    enabled: !!id,
  });
}

export function useSaveSimulation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      params,
      result,
      name,
    }: {
      params: SimulationParams;
      result: OptimizationResultWithStrategy;
      name?: string;
    }) => api.saveSimulation(params, result, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["simulations"] });
    },
  });
}

export function useUpdateSimulationName() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string | null }) =>
      api.updateSimulationName(id, name),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["simulations"] });
      queryClient.invalidateQueries({ queryKey: ["simulation", variables.id] });
    },
  });
}

export function useTogglePinnedSimulation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) =>
      api.updateSimulationPinned(id, pinned),
    onMutate: async ({ id, pinned }) => {
      await queryClient.cancelQueries({ queryKey: ["simulations"] });
      const previous = queryClient.getQueryData<SimulationListItem[]>([
        "simulations",
      ]);
      if (previous) {
        const next = previous
          .map((sim) => (sim.id === id ? { ...sim, pinned } : sim))
          .sort((a, b) => {
            if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
            return (
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
          });
        queryClient.setQueryData(["simulations"], next);
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["simulations"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["simulations"] });
    },
  });
}

export function useDeleteSimulation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.deleteSimulation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["simulations"] });
    },
  });
}

export function useRerunSimulation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, params }: { id: string; params: SimulationParams }) => {
      const now = new Date();
      const nextParams: SimulationParams = {
        ...params,
        dateRange: {
          ...params.dateRange,
          endMonth: now.getMonth() + 1,
          endYear: now.getFullYear(),
        },
      };

      const startMonth = String(nextParams.dateRange.startMonth).padStart(2, "0");
      const startDate = `${nextParams.dateRange.startYear}-${startMonth}-01`;
      const endMonth = String(nextParams.dateRange.endMonth).padStart(2, "0");
      const lastDay = new Date(
        nextParams.dateRange.endYear,
        nextParams.dateRange.endMonth,
        0
      ).getDate();
      const endDate = `${nextParams.dateRange.endYear}-${endMonth}-${String(lastDay).padStart(2, "0")}`;

      const result = await api.optimizePortfolio(nextParams.tickers, nextParams.strategy, {
        wMax: nextParams.assetConstraints ? nextParams.wMax : 1,
        riskFreeRate: nextParams.strategy === "max-sharpe" ? nextParams.riskFreeRate : 0,
        targetReturn:
          nextParams.strategy === "target-return" ? nextParams.targetReturn : undefined,
        targetRisk: nextParams.strategy === "target-risk" ? nextParams.targetRisk : undefined,
        startDate,
        endDate,
        enforceFullInvestment: nextParams.enforceFullInvestment,
        allowShortSelling: nextParams.allowShortSelling,
        maxLeverage: nextParams.useLeverage ? nextParams.maxLeverage : 1.0,
      });

      return api.updateSimulation(id, nextParams, result);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["simulations"] });
      queryClient.invalidateQueries({ queryKey: ["simulation", variables.id] });
    },
  });
}

export function isDateRangeCurrent(dateRange: SimulationParams["dateRange"]): boolean {
  const now = new Date();
  return (
    dateRange.endMonth === now.getMonth() + 1 && dateRange.endYear === now.getFullYear()
  );
}
