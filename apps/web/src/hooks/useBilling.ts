"use client";

import { useMutation, useQuery, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useWallet(enabled: boolean = true) {
  return useQuery({
    queryKey: ["billing", "wallet"],
    queryFn: () => api.getWallet(),
    enabled,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}

export function usePackages(rail: "stripe" | "coinbase_commerce" = "stripe") {
  return useQuery({
    queryKey: ["billing", "packages", rail],
    queryFn: () => api.getPackages(rail),
  });
}

export function useCreateCheckout() {
  return useMutation({
    mutationFn: (packageId: string) => api.createCheckoutSession(packageId),
  });
}

export function useCreateCryptoCheckout() {
  return useMutation({
    mutationFn: (packageId: string) => api.createCryptoCheckoutSession(packageId),
  });
}

export function useLedger() {
  return useInfiniteQuery({
    queryKey: ["billing", "ledger"],
    queryFn: ({ pageParam }: { pageParam: number | undefined }) =>
      api.getLedger(pageParam),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useInvalidateWallet() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["billing"] });
}

export function useBookAdvisorCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (idempotencyKey: string) => api.bookAdvisorCall(idempotencyKey),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing"] });
    },
  });
}
