"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, CreateScheduleInput, UpdateScheduleInput } from "@/lib/api";

export function useSchedules(enabled: boolean = true) {
  return useQuery({
    queryKey: ["schedules"],
    queryFn: () => api.listSchedules(),
    enabled,
  });
}

export function useCreateSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateScheduleInput) => api.createSchedule(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
    },
  });
}

export function useUpdateSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateScheduleInput }) =>
      api.updateSchedule(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
    },
  });
}

export function useDeleteSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.deleteSchedule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
    },
  });
}

export function useSimulationRuns(simulationId: string | null) {
  return useQuery({
    queryKey: ["simulation-runs", simulationId],
    queryFn: () => api.listSimulationRuns(simulationId!),
    enabled: !!simulationId,
  });
}
