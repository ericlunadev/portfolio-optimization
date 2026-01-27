"use client";

import { useState, useCallback, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface YahooUpdateState {
  taskId: string | null;
  progress: number;
  status: "idle" | "running" | "completed" | "failed";
  message: string;
}

export function useYahooUpdate() {
  const [state, setState] = useState<YahooUpdateState>({
    taskId: null,
    progress: 0,
    status: "idle",
    message: "",
  });

  const startMutation = useMutation({
    mutationFn: api.startYahooUpdate,
    onSuccess: (data) => {
      setState({
        taskId: data.task_id,
        progress: 0,
        status: "running",
        message: "Starting update...",
      });
    },
  });

  // Poll for status when running
  const { data: taskStatus } = useQuery({
    queryKey: ["task-status", state.taskId],
    queryFn: () => api.getTaskStatus(state.taskId!),
    enabled: !!state.taskId && state.status === "running",
    refetchInterval: 1000,
  });

  useEffect(() => {
    if (taskStatus) {
      setState((prev) => ({
        ...prev,
        progress: taskStatus.progress,
        status: taskStatus.status as YahooUpdateState["status"],
        message: taskStatus.result_data || taskStatus.error_message || "",
      }));
    }
  }, [taskStatus]);

  const startUpdate = useCallback(() => {
    startMutation.mutate();
  }, [startMutation]);

  const reset = useCallback(() => {
    setState({
      taskId: null,
      progress: 0,
      status: "idle",
      message: "",
    });
  }, []);

  return {
    ...state,
    startUpdate,
    reset,
    isLoading: startMutation.isPending,
  };
}
