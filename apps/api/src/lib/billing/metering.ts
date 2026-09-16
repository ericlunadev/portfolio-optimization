import { randomUUID } from "node:crypto";
import { spendCredit, reverseSpend, type SpendResult } from "./spend.js";

// Use inside a metered route handler — after auth + zValidator. Returns the
// spend handle; the caller is responsible for calling reverseSpendOnError(handle)
// in a catch block if the handler's heavy work fails.
//
// `organizationId` comes from `c.get("organizationId")` and keys the wallet;
// `user` is the attribution written to the ledger row.
//
// Idempotent on the `Idempotency-Key` request header, per organization — safe
// under client retries.
export async function meterRequest(opts: {
  organizationId: string;
  user: { id: string };
  cost: number;
  idempotencyKey: string;
}): Promise<SpendResult> {
  const { organizationId, user, cost, idempotencyKey } = opts;
  return spendCredit({
    organizationId,
    userId: user.id,
    idempotencyKey,
    cost,
  });
}

export function newIdempotencyKey(): string {
  return randomUUID();
}

// Namespaces a caller-supplied `Idempotency-Key` so it cannot collide with a
// key the server writes for itself.
//
// The server uses `signup-grant:<user id>` and `purchase:<checkout session id>`,
// both of which a caller can reconstruct from values they already hold. Passed
// through verbatim, either one replays that earlier *credit* row on a metered
// route and the caller is charged nothing. Prefixing keeps the two namespaces
// disjoint while leaving the server-written formats byte-identical, so Stripe's
// multi-day retries and onboarding re-completion still deduplicate correctly.
export function clientIdempotencyKey(header: string | undefined): string {
  return header ? `client:${header}` : newIdempotencyKey();
}

// No organization argument: `reverseSpend` reads both keys off the original
// ledger row, so a refund cannot land on the wrong tenant.
export async function reverseSpendOnError(
  spend: SpendResult,
  reason: string
): Promise<void> {
  await reverseSpend(spend.ledgerId, reason);
}
