import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import {
  bookAdvisorCall,
  createCheckoutForRail,
  getLedger,
  getPackages,
  getWallet,
  type BillingRail,
} from '@/lib/api/billing';

/** Root query key for everything under billing, so one call invalidates all. */
export const BILLING_KEY = ['billing'] as const;

export function useWallet() {
  return useQuery({
    queryKey: [...BILLING_KEY, 'wallet'],
    queryFn: getWallet,
  });
}

export function usePackages(rail: BillingRail) {
  return useQuery({
    queryKey: [...BILLING_KEY, 'packages', rail],
    queryFn: () => getPackages(rail),
  });
}

export function useLedger() {
  return useInfiniteQuery({
    queryKey: [...BILLING_KEY, 'ledger'],
    queryFn: ({ pageParam }) => getLedger(pageParam),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

/** Re-fetches the wallet and ledger, e.g. after a checkout or a spend. */
export function useRefreshBilling() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: BILLING_KEY });
}

export function useCheckout() {
  return useMutation({
    mutationFn: ({ rail, packageId }: { rail: BillingRail; packageId: string }) =>
      createCheckoutForRail(rail, packageId),
  });
}

export function useBookAdvisorCall() {
  const refresh = useRefreshBilling();
  return useMutation({
    mutationFn: (idempotencyKey: string) => bookAdvisorCall(idempotencyKey),
    onSuccess: () => refresh(),
  });
}
