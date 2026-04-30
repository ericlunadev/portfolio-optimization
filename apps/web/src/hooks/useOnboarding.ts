"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type OnboardingStepPayload } from "@/lib/api";

const ONBOARDING_KEY = ["onboarding"] as const;

export function useOnboardingProfile(enabled: boolean = true) {
  return useQuery({
    queryKey: ONBOARDING_KEY,
    queryFn: () => api.getOnboarding(),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function usePatchOnboardingStep() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ step, data }: { step: 1 | 2 | 3; data: OnboardingStepPayload }) =>
      api.patchOnboardingStep(step, data),
    onSuccess: (data) => {
      queryClient.setQueryData(ONBOARDING_KEY, data);
    },
  });
}

export function useCompleteOnboarding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.completeOnboarding(),
    onSuccess: (data) => {
      queryClient.setQueryData(ONBOARDING_KEY, data);
    },
  });
}
