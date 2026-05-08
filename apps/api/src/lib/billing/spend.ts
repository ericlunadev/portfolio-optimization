import { eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { randomUUID } from "node:crypto";
import { db } from "../../db/index.js";
import { creditLedger, walletBalance } from "../../db/schema.js";

export type LedgerReason = "purchase" | "spend" | "grant" | "reversal";

export type SpendResult = { ledgerId: string; balanceAfter: number };

async function ensureWalletRow(userId: string): Promise<void> {
  await db
    .insert(walletBalance)
    .values({ userId, credits: 0 })
    .onConflictDoNothing();
}

async function findExistingLedgerRow(
  idempotencyKey: string
): Promise<SpendResult | null> {
  const existing = await db.query.creditLedger.findFirst({
    where: eq(creditLedger.idempotencyKey, idempotencyKey),
  });
  return existing
    ? { ledgerId: existing.id, balanceAfter: existing.balanceAfter }
    : null;
}

// Atomically deducts `cost` credits and writes a ledger row.
// Idempotent on `idempotencyKey`. Throws HTTPException(402) on insufficient balance.
export async function spendCredit(opts: {
  userId: string;
  idempotencyKey: string;
  cost: number;
  simulationId?: string;
}): Promise<SpendResult> {
  const { userId, idempotencyKey, cost, simulationId } = opts;
  if (cost <= 0) throw new Error("spendCredit: cost must be positive");

  const replay = await findExistingLedgerRow(idempotencyKey);
  if (replay) return replay;

  await ensureWalletRow(userId);

  return await db.transaction(async (tx) => {
    const update = await tx.run(
      sql`UPDATE wallet_balance
          SET credits = credits - ${cost}, updated_at = unixepoch()
          WHERE user_id = ${userId} AND credits >= ${cost}`
    );
    if (Number(update.rowsAffected) === 0) {
      throw new HTTPException(402, { message: "INSUFFICIENT_CREDITS" });
    }

    const wallet = await tx.query.walletBalance.findFirst({
      where: eq(walletBalance.userId, userId),
    });
    const balanceAfter = wallet?.credits ?? 0;

    const ledgerId = randomUUID();
    try {
      await tx.insert(creditLedger).values({
        id: ledgerId,
        userId,
        delta: -cost,
        reason: "spend",
        simulationId: simulationId ?? null,
        idempotencyKey,
        balanceAfter,
      });
    } catch (err) {
      // Concurrent request with the same idempotency key won the race.
      // Re-read and return the canonical row.
      const winner = await findExistingLedgerRow(idempotencyKey);
      if (winner) return winner;
      throw err;
    }

    return { ledgerId, balanceAfter };
  });
}

// Adds `credits` to a user's wallet and writes a ledger row.
// Idempotent on `idempotencyKey`. Used for purchases, grants, and reversals.
export async function grantCredits(opts: {
  userId: string;
  credits: number;
  reason: Exclude<LedgerReason, "spend">;
  idempotencyKey: string;
  paymentId?: string;
}): Promise<SpendResult> {
  const { userId, credits, reason, idempotencyKey, paymentId } = opts;
  if (credits <= 0) throw new Error("grantCredits: credits must be positive");

  const replay = await findExistingLedgerRow(idempotencyKey);
  if (replay) return replay;

  await ensureWalletRow(userId);

  return await db.transaction(async (tx) => {
    await tx.run(
      sql`UPDATE wallet_balance
          SET credits = credits + ${credits}, updated_at = unixepoch()
          WHERE user_id = ${userId}`
    );

    const wallet = await tx.query.walletBalance.findFirst({
      where: eq(walletBalance.userId, userId),
    });
    const balanceAfter = wallet?.credits ?? 0;

    const ledgerId = randomUUID();
    try {
      await tx.insert(creditLedger).values({
        id: ledgerId,
        userId,
        delta: credits,
        reason,
        paymentId: paymentId ?? null,
        idempotencyKey,
        balanceAfter,
      });
    } catch (err) {
      const winner = await findExistingLedgerRow(idempotencyKey);
      if (winner) return winner;
      throw err;
    }

    return { ledgerId, balanceAfter };
  });
}

// Reverses an earlier spend (used when the optimization throws after the credit was deducted).
// Looks up the original spend's delta and credits the absolute value back, idempotently.
export async function reverseSpend(
  ledgerId: string,
  reason: string
): Promise<void> {
  const original = await db.query.creditLedger.findFirst({
    where: eq(creditLedger.id, ledgerId),
  });
  if (!original) {
    console.warn(`[billing] reverseSpend: ledger row ${ledgerId} not found`);
    return;
  }
  if (original.reason !== "spend" || original.delta >= 0) {
    console.warn(
      `[billing] reverseSpend: ledger row ${ledgerId} is not a spend (reason=${original.reason}, delta=${original.delta})`
    );
    return;
  }

  await grantCredits({
    userId: original.userId,
    credits: -original.delta,
    reason: "reversal",
    idempotencyKey: `reverse:${ledgerId}:${reason}`,
  });
}
