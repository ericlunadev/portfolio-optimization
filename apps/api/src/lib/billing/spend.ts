import { and, eq, ne, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { randomUUID } from "node:crypto";
import { db } from "../../db/index.js";
import { creditLedger, walletBalance } from "../../db/schema.js";

export type LedgerReason = "purchase" | "spend" | "grant" | "reversal";

export type SpendResult = { ledgerId: string; balanceAfter: number };

// The wallet is keyed on the organization (one balance per tenant); the ledger
// carries the per-user attribution.
async function ensureWalletRow(organizationId: string): Promise<void> {
  await db
    .insert(walletBalance)
    .values({ organizationId, credits: 0 })
    .onConflictDoNothing();
}

// Scoped to the organization, matching unique(organization_id, idempotency_key).
//
// `kind` narrows the match to rows of the same sign, and it is load-bearing, not
// tidiness. The metered routes take `idempotency_key` from a raw client header,
// and the server writes two formats a caller can reconstruct for themselves —
// `signup-grant:<their own user id>` and `purchase:<their own checkout session
// id>`. Without this filter, replaying one of those against a metered endpoint
// hands the caller their own earlier *credit* row and spends nothing: a free
// optimization, or a free advisor call. The routes additionally prefix client
// keys with `client:` (see `clientIdempotencyKey`), so the two namespaces cannot
// collide even before this filter applies.
async function findExistingLedgerRow(
  organizationId: string,
  idempotencyKey: string,
  kind: "spend" | "credit"
): Promise<SpendResult | null> {
  const existing = await db.query.creditLedger.findFirst({
    where: and(
      eq(creditLedger.organizationId, organizationId),
      eq(creditLedger.idempotencyKey, idempotencyKey),
      kind === "spend"
        ? eq(creditLedger.reason, "spend")
        : ne(creditLedger.reason, "spend")
    ),
  });
  return existing
    ? { ledgerId: existing.id, balanceAfter: existing.balanceAfter }
    : null;
}

// Sentinel thrown out of a transaction callback when the ledger insert fails.
// Returning normally from the callback makes Drizzle commit, which would leave
// that transaction's wallet change standing with no ledger row behind it.
class LedgerInsertFailed extends Error {
  constructor(cause: unknown) {
    super("credit ledger insert failed", { cause });
  }
}

// Recovers from a rolled-back transaction: a concurrent request with the same
// idempotency key won, so its row is the canonical one. This has to run outside
// the transaction because `findExistingLedgerRow` reads through the module-level
// `db` and cannot see another connection's uncommitted writes.
async function resolveRaceWinner(
  organizationId: string,
  idempotencyKey: string,
  kind: "spend" | "credit",
  err: unknown
): Promise<SpendResult> {
  if (!(err instanceof LedgerInsertFailed)) throw err;
  const winner = await findExistingLedgerRow(organizationId, idempotencyKey, kind);
  if (winner) return winner;
  throw err.cause;
}

// Atomically deducts `cost` credits from the organization's wallet and writes a
// ledger row attributed to `userId`.
// Idempotent on `idempotencyKey` within the organization. Throws HTTPException(402)
// on insufficient balance.
export async function spendCredit(opts: {
  organizationId: string;
  userId: string;
  idempotencyKey: string;
  cost: number;
  simulationId?: string;
}): Promise<SpendResult> {
  const { organizationId, userId, idempotencyKey, cost, simulationId } = opts;
  if (cost <= 0) throw new Error("spendCredit: cost must be positive");

  const replay = await findExistingLedgerRow(organizationId, idempotencyKey, "spend");
  if (replay) return replay;

  await ensureWalletRow(organizationId);

  try {
    return await db.transaction(async (tx) => {
      const update = await tx.run(
        sql`UPDATE wallet_balance
            SET credits = credits - ${cost}, updated_at = unixepoch()
            WHERE organization_id = ${organizationId} AND credits >= ${cost}`
      );
      if (Number(update.rowsAffected) === 0) {
        throw new HTTPException(402, { message: "INSUFFICIENT_CREDITS" });
      }

      const wallet = await tx.query.walletBalance.findFirst({
        where: eq(walletBalance.organizationId, organizationId),
      });
      const balanceAfter = wallet?.credits ?? 0;

      const ledgerId = randomUUID();
      try {
        await tx.insert(creditLedger).values({
          id: ledgerId,
          organizationId,
          userId,
          delta: -cost,
          reason: "spend",
          simulationId: simulationId ?? null,
          idempotencyKey,
          balanceAfter,
        });
      } catch (err) {
        // Probably a concurrent request with the same idempotency key. Throw so
        // the deduction above rolls back; the winner is resolved outside.
        throw new LedgerInsertFailed(err);
      }

      return { ledgerId, balanceAfter };
    });
  } catch (err) {
    return await resolveRaceWinner(organizationId, idempotencyKey, "spend", err);
  }
}

// Adds `credits` to an organization's wallet and writes a ledger row.
// Idempotent on `idempotencyKey` within the organization. Used for purchases,
// grants, and reversals.
//
// `userId` is nullable because a ledger row outlives its user (`ON DELETE set
// null`) and a platform-level admin grant has no acting user at all.
export async function grantCredits(opts: {
  organizationId: string;
  userId: string | null;
  credits: number;
  reason: Exclude<LedgerReason, "spend">;
  idempotencyKey: string;
  paymentId?: string;
}): Promise<SpendResult> {
  const { organizationId, userId, credits, reason, idempotencyKey, paymentId } =
    opts;
  if (credits <= 0) throw new Error("grantCredits: credits must be positive");

  const replay = await findExistingLedgerRow(organizationId, idempotencyKey, "credit");
  if (replay) return replay;

  await ensureWalletRow(organizationId);

  try {
    return await db.transaction(async (tx) => {
      await tx.run(
        sql`UPDATE wallet_balance
            SET credits = credits + ${credits}, updated_at = unixepoch()
            WHERE organization_id = ${organizationId}`
      );

      const wallet = await tx.query.walletBalance.findFirst({
        where: eq(walletBalance.organizationId, organizationId),
      });
      const balanceAfter = wallet?.credits ?? 0;

      const ledgerId = randomUUID();
      try {
        await tx.insert(creditLedger).values({
          id: ledgerId,
          organizationId,
          userId,
          delta: credits,
          reason,
          paymentId: paymentId ?? null,
          idempotencyKey,
          balanceAfter,
        });
      } catch (err) {
        throw new LedgerInsertFailed(err);
      }

      return { ledgerId, balanceAfter };
    });
  } catch (err) {
    return await resolveRaceWinner(organizationId, idempotencyKey, "credit", err);
  }
}

// Reverses an earlier spend (used when the optimization throws after the credit was deducted).
// Looks up the original spend's delta and credits the absolute value back, idempotently.
// Both keys come from the original row: re-deriving the organization from the
// caller's current membership would refund the wrong tenant.
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
    organizationId: original.organizationId,
    userId: original.userId,
    credits: -original.delta,
    reason: "reversal",
    idempotencyKey: `reverse:${ledgerId}:${reason}`,
  });
}
