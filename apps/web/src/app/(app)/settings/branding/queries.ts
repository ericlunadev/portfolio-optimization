"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BrandingSettings } from "./form";

// The two owner-only branding calls, kept beside the page that makes them.
//
// Mirrors `lib/api.ts`: with NEXT_PUBLIC_API_URL set the browser calls the API
// host directly and the session cookie has to be sent cross-origin. That module
// keeps its fetch wrapper private, so the two lines are repeated rather than
// reached into — the same trade `(app)/billing/queries.ts` makes.
const API_BASE = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/api`
  : "/api";
const isExternal = !!process.env.NEXT_PUBLIC_API_URL;

export const BRANDING_SETTINGS_QUERY_KEY = ["organization", "branding", "settings"];

/**
 * A failed branding call, carrying its status.
 *
 * The status is load-bearing rather than diagnostic: a 403 is the server saying
 * "you are a member, not an owner", which the page renders as a notice — not as
 * an error to report.
 */
export class BrandingRequestError extends Error {
  constructor(
    public status: number,
    /** Per-field messages from the server, when it sent any. */
    public fields?: Record<string, string>
  ) {
    super(`Branding request failed (${status})`);
    this.name = "BrandingRequestError";
  }
}

async function readError(response: Response): Promise<BrandingRequestError> {
  const body = await response.json().catch(() => ({}));
  return new BrandingRequestError(response.status, body?.fields);
}

export function useBrandingSettings() {
  return useQuery<BrandingSettings, BrandingRequestError>({
    queryKey: BRANDING_SETTINGS_QUERY_KEY,
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/organizations/branding/settings`, {
        credentials: isExternal ? "include" : "same-origin",
      });
      if (!response.ok) throw await readError(response);
      return response.json();
    },
    // No retry: the common failure is the deliberate 403 a member gets, and
    // retrying it only delays the notice they are meant to read.
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function useSaveBranding() {
  const queryClient = useQueryClient();

  return useMutation<BrandingSettings, BrandingRequestError, Record<string, string>>({
    mutationFn: async (body) => {
      const response = await fetch(`${API_BASE}/organizations/branding`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: isExternal ? "include" : "same-origin",
        body: JSON.stringify(body),
      });
      if (!response.ok) throw await readError(response);
      return response.json();
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(BRANDING_SETTINGS_QUERY_KEY, saved);
      // The accent feeds the charts and the PDF through `useOrganizationBranding`,
      // which reads a different endpoint — so a save has to invalidate that too or
      // the page the tenant just rebranded keeps painting the old colour.
      queryClient.invalidateQueries({
        queryKey: ["organization", "branding"],
        exact: true,
      });
    },
  });
}
