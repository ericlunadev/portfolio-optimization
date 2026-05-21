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
