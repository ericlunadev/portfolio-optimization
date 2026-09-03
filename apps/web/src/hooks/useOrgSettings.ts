"use client";

import { useQuery } from "@tanstack/react-query";
import {
  resolveOrgSettings,
  type OrgSettings,
} from "@/lib/org-settings";

// One authenticated read of the caller's own organization's product switches.
//
// This is deliberately the smallest mechanism that works, not the final one.
// PLAN Phase 1 resolves the tenant from the Host header in `middleware.ts` and
// injects a tenant config from the root layout; these switches belong in that
// config, where they are known before first paint instead of one fetch later.

// Mirrors `lib/api.ts`: with NEXT_PUBLIC_API_URL set the browser calls the API
// host directly and the session cookie has to be sent cross-origin. That module
// keeps its fetch wrapper private, so the two lines are repeated rather than
// reached into.
const API_BASE = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/api`
  : "/api";
const isExternal = !!process.env.NEXT_PUBLIC_API_URL;

export const ORG_SETTINGS_QUERY_KEY = ["organization", "settings"] as const;

export async function fetchOrgSettings(): Promise<OrgSettings> {
  const res = await fetch(`${API_BASE}/organizations/settings`, {
    credentials: isExternal ? "include" : "same-origin",
  });
  if (!res.ok) {
    throw new Error(`Failed to load organization settings (${res.status})`);
  }
  return res.json();
}

/**
 * The organization's product switches, with the fallback already applied — a
 * caller never has to decide what an unresolved tenant looks like.
 */
export function useOrgSettings(): { settings: OrgSettings; isLoading: boolean } {
  const query = useQuery({
    queryKey: ORG_SETTINGS_QUERY_KEY,
    queryFn: fetchOrgSettings,
    // Tenant switches change when an operator changes them, which is rare, and
    // never mid-session in a way the user needs to see immediately.
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    // No retry. The common failure is a 401 — `/academia` is reachable signed
    // out — and retrying only lengthens the window a caller spends waiting for
    // an answer the fallback already covers.
    retry: false,
  });

  return { settings: resolveOrgSettings(query.data), isLoading: query.isLoading };
}
