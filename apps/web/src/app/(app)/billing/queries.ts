"use client";

import { useQuery } from "@tanstack/react-query";
import { resolveRails, type Rail } from "./rails";
import type { Usage } from "./usage";

// The two billing reads that are org-level rather than personal, kept beside the
// page that uses them: the rails this tenant may pay with (Task 2.7) and the
// owner's usage view (Task 2.4).
//
// Mirrors `lib/api.ts`: with NEXT_PUBLIC_API_URL set the browser calls the API
// host directly and the session cookie has to be sent cross-origin. That module
// keeps its fetch wrapper private, so the two lines are repeated rather than
// reached into — the same trade `hooks/useOrgSettings.ts` makes.
const API_BASE = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/api`
  : "/api";
const isExternal = !!process.env.NEXT_PUBLIC_API_URL;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: isExternal ? "include" : "same-origin",
  });
  if (!res.ok) {
    throw new Error(`Request to ${path} failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

/**
 * The rails this organization may pay with, fallback already applied — a caller
 * never has to decide what an unanswered request looks like.
 */
export function useAvailableRails(): { rails: Rail[]; isLoading: boolean } {
  const query = useQuery({
    queryKey: ["billing", "rails"],
    queryFn: () => getJson<{ rails: Rail[] }>("/billing/rails"),
    // A tenant's rails change when an operator changes them, which is rare and
    // never mid-session.
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  return { rails: resolveRails(query.data), isLoading: query.isLoading };
}

/**
 * The owner's usage view. Every member request answers 403, which is not an
 * error to report but the answer itself — the panel renders nothing.
 */
export function useUsage() {
  return useQuery({
    queryKey: ["billing", "usage"],
    queryFn: () => getJson<Usage>("/billing/usage"),
    // No retry: the common failure is the deliberate 403 a member gets.
    retry: false,
    refetchOnWindowFocus: false,
  });
}
