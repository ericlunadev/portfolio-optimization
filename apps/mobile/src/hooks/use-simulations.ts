import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { optimizePortfolio } from '@/lib/api/optimization';
import {
  deleteSimulation,
  getSimulation,
  listSimulations,
  saveSimulation,
  updateSimulation,
  updateSimulationName,
  updateSimulationPinned,
  type SavedSimulation,
  type SimulationListItem,
  type SimulationParams,
} from '@/lib/api/simulations';
import type { OptimizationResult } from '@/lib/api/optimization';

/** Root query key for the saved-simulations list. */
export const SIMULATIONS_KEY = ['simulations'] as const;

const simulationKey = (id: string) => ['simulation', id] as const;

/** Pinned first, then most recent — matches the API's ordering. */
function sortSimulations(items: SimulationListItem[]): SimulationListItem[] {
  return [...items].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function useSimulations(enabled = true) {
  return useQuery({
    queryKey: SIMULATIONS_KEY,
    queryFn: listSimulations,
    enabled,
  });
}

export function useSimulation(id: string | null) {
  return useQuery({
    queryKey: simulationKey(id ?? ''),
    queryFn: () => getSimulation(id as string),
    enabled: Boolean(id),
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
      result: OptimizationResult;
      name?: string;
    }): Promise<SavedSimulation> => saveSimulation(params, result, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SIMULATIONS_KEY }),
  });
}

export function useUpdateSimulationName() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string | null }) => updateSimulationName(id, name),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: SIMULATIONS_KEY });
      queryClient.invalidateQueries({ queryKey: simulationKey(id) });
    },
  });
}

export function useTogglePinnedSimulation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) => updateSimulationPinned(id, pinned),
    // Optimistically reorder so pinning feels instant; roll back on failure.
    onMutate: async ({ id, pinned }) => {
      await queryClient.cancelQueries({ queryKey: SIMULATIONS_KEY });
      const previous = queryClient.getQueryData<SimulationListItem[]>(SIMULATIONS_KEY);
      if (previous) {
        const next = sortSimulations(previous.map((item) => (item.id === id ? { ...item, pinned } : item)));
        queryClient.setQueryData(SIMULATIONS_KEY, next);
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(SIMULATIONS_KEY, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: SIMULATIONS_KEY }),
  });
}

export function useDeleteSimulation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSimulation(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SIMULATIONS_KEY }),
  });
}

/**
 * Re-runs a saved simulation against the latest data: recompute with the stored
 * params, then persist the fresh result over the old one.
 */
export function useRerunSimulation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, params }: { id: string; params: SimulationListItem['params'] }) => {
      const result = await optimizePortfolio(params);
      return updateSimulation(id, params, result);
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: SIMULATIONS_KEY });
      queryClient.invalidateQueries({ queryKey: simulationKey(id) });
    },
  });
}
