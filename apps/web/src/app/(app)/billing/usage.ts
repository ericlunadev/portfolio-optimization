// What `GET /api/billing/usage` returns, and the decisions taken from it.
//
// PLAN Task 2.4. The endpoint is the owner's org-wide view of one shared wallet
// (D7): every seat's spending, plus the rows that belong to no seat at all.
//
// Kept apart from the fetching hook, like `lib/org-settings.ts`, so the
// decisions are testable in the node environment the web suite runs today.

export type UsageMember = {
  /** Null for the bucket of rows that belong to no user — see `unattributedKey`. */
  userId: string | null;
  name: string | null;
  email: string | null;
  role: string | null;
  isCurrentMember: boolean;
  spent: number;
  added: number;
  runs: number;
  simulations: number;
  lastActivityAt: string | null;
};

export type UsageActivity = {
  id: string;
  delta: number;
  reason: string;
  balanceAfter: number;
  simulationId: string | null;
  createdAt: string | null;
  actor: { userId: string; name: string | null } | null;
};

export type UsageTotals = {
  balance: number;
  spent: number;
  added: number;
  runs: number;
  simulations: number;
  seats: number;
};

export type Usage = {
  totals: UsageTotals;
  members: UsageMember[];
  recent: UsageActivity[];
};

/**
 * Which label a row with no user gets.
 *
 * `credit_ledger.user_id` is nullable for two unrelated reasons, and calling
 * both of them "former member" would put that label on a grant we wrote
 * ourselves. A bucket that only ever received credits is an operator grant; one
 * that spent anything was a person, and that person is gone.
 */
export function unattributedKey(row: {
  spent: number;
  runs: number;
}): "usageFormerMember" | "usagePlatformGrant" {
  return row.spent === 0 && row.runs === 0 ? "usagePlatformGrant" : "usageFormerMember";
}

/** The same question for one activity row, where the reason says it outright. */
export function actorKey(row: {
  reason: string;
  actor: { name: string | null } | null;
}): "usageFormerMember" | "usagePlatformGrant" | null {
  if (row.actor) return null;
  return row.reason === "spend" ? "usageFormerMember" : "usagePlatformGrant";
}

/** A seat's display name: their name, else the address we know them by. */
export function memberName(member: UsageMember): string | null {
  return member.name ?? member.email ?? null;
}

/** DD/MM/YYYY, per CLAUDE.md. `—` for a seat that has done nothing yet. */
export function formatUsageDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getFullYear()}`;
}

/** Signed, so a credit reads as a credit at a glance. */
export function formatDelta(delta: number): string {
  return delta >= 0 ? `+${delta}` : String(delta);
}
