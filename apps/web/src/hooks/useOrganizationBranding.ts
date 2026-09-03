"use client";

import { useQuery } from "@tanstack/react-query";
import { api, OrganizationBranding } from "@/lib/api";

/**
 * The caller's own tenant branding, or `null` when there is none to read.
 *
 * The endpoint is behind the session, and the results view also renders for a
 * signed-out visitor, so a 401 here is an ordinary outcome rather than an error
 * worth surfacing: every consumer already falls back to our default copy.
 */
export function useOrganizationBranding() {
  return useQuery<OrganizationBranding | null>({
    queryKey: ["organization", "branding"],
    queryFn: async () => {
      try {
        return await api.getOrganizationBranding();
      } catch {
        return null;
      }
    },
    // Branding changes when a tenant edits their settings, not while someone
    // reads a chart.
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
