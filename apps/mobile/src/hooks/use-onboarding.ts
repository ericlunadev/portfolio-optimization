import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  completeOnboarding,
  getOnboarding,
  patchOnboardingStep,
  type OnboardingStepPayload,
} from '@/lib/api/onboarding';
import { BILLING_KEY } from '@/hooks/use-billing';

/** Root query key for the onboarding profile. */
export const ONBOARDING_KEY = ['onboarding'] as const;

/**
 * Reads the onboarding profile. `enabled` is gated on having a session so the
 * (auth-required) request never fires for signed-out users.
 */
export function useOnboardingProfile(enabled: boolean = true) {
  return useQuery({
    queryKey: ONBOARDING_KEY,
    queryFn: getOnboarding,
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

/** Persists one wizard step, seeding the cache with the returned profile. */
export function usePatchOnboardingStep() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ step, data }: { step: 1 | 2 | 3; data: OnboardingStepPayload }) =>
      patchOnboardingStep(step, data),
    onSuccess: (data) => {
      queryClient.setQueryData(ONBOARDING_KEY, data);
    },
  });
}

/**
 * Finalizes onboarding. The server grants 3 signup credits on success, so we
 * also invalidate the billing query key to refresh the wallet balance.
 */
export function useCompleteOnboarding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: completeOnboarding,
    onSuccess: (data) => {
      queryClient.setQueryData(ONBOARDING_KEY, data);
      queryClient.invalidateQueries({ queryKey: BILLING_KEY });
    },
  });
}
