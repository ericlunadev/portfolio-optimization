import { randomUUID } from "node:crypto";
import { spendCredit, reverseSpend, type SpendResult } from "./spend.js";

// Use inside a metered route handler — after auth + zValidator. Returns the
// spend handle; the caller is responsible for calling reverseSpendOnError(handle)
// in a catch block if the handler's heavy work fails.
//
// Idempotent on the `Idempotency-Key` request header — safe under client retries.
export async function meterRequest(
  user: { id: string },
  cost: number,
  idempotencyKey: string
): Promise<SpendResult> {
  return spendCredit({ userId: user.id, idempotencyKey, cost });
}

export function newIdempotencyKey(): string {
  return randomUUID();
}

export async function reverseSpendOnError(
  spend: SpendResult,
  reason: string
): Promise<void> {
  await reverseSpend(spend.ledgerId, reason);
}
