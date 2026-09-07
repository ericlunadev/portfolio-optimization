import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import { db } from "../../db/index.js";
import {
  creditLedger,
  organization,
  organizationMember,
  organizationSettings,
  user,
  walletBalance,
} from "../../db/schema.js";
import { emailMessages } from "../email/i18n.js";
import { getLocaleFromRequest } from "../email/locale.js";
import { sendEmail } from "../email/send.js";
import { LowBalance } from "../email/templates/LowBalance.js";

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

// How far below zero this tenant is allowed to go. Never hard-block a paying
// tenant in front of their own client: an analyst who hits a 402 mid-meeting is
// the worst failure this system has. The column defaults to 0, and so does a
// missing settings row — which is today's behaviour exactly, no spend below zero.
//
// Clamped at 0 because a negative limit would mean "refuse while credits remain",
// which no caller intends and which no UI can produce.
async function readOverdraftLimit(organizationId: string): Promise<number> {
  const settings = await db.query.organizationSettings.findFirst({
    where: eq(organizationSettings.organizationId, organizationId),
    columns: { overdraftLimit: true },
  });
  return Math.max(0, settings?.overdraftLimit ?? 0);
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

// ==================== Low-balance warning ====================

const LOW_BALANCE_FRACTION = 0.2;

// The size of the organization's most recent top-up, which is what the warning
// threshold is a fraction of.
//
// Reversals are excluded: refunding a failed optimization is not a purchase, and
// counting one would reset the threshold to a few credits and silence the
// warning for the rest of the cycle. Ordered by `rowid` after `created_at`
// because that column is second-granular and two top-ups in the same second are
// ordinary; the ledger is append-only, so insert order is chronological order.
async function lastTopUpCredits(organizationId: string): Promise<number | null> {
  const [row] = await db
    .select({ delta: creditLedger.delta })
    .from(creditLedger)
    .where(
      and(
        eq(creditLedger.organizationId, organizationId),
        inArray(creditLedger.reason, ["purchase", "grant"])
      )
    )
    .orderBy(desc(creditLedger.createdAt), desc(sql`rowid`))
    .limit(1);

  return row && row.delta > 0 ? row.delta : null;
}

// The person who is invoiced, and the organization name to address them about.
// The founding owner when there are several, so the same address is warned every
// cycle rather than whoever was promoted last.
async function findOwnerToWarn(
  organizationId: string
): Promise<{ email: string; name: string; organizationName: string } | null> {
  const [row] = await db
    .select({
      email: user.email,
      name: user.name,
      organizationName: organization.name,
    })
    .from(organizationMember)
    .innerJoin(user, eq(user.id, organizationMember.userId))
    .innerJoin(organization, eq(organization.id, organizationMember.organizationId))
    .where(
      and(
        eq(organizationMember.organizationId, organizationId),
        eq(organizationMember.role, "owner")
      )
    )
    .orderBy(organizationMember.createdAt)
    .limit(1);

  return row ?? null;
}

// Warns the owner when a spend takes the wallet from above 20% of the last
// top-up to at or below it.
//
// A crossing, not a level: that is what makes it fire once per top-up cycle
// without a `last_warned_at` column. Every later spend in the cycle starts
// already below the threshold, so it warns nothing; the next top-up lifts the
// balance back above it and re-arms the warning. Overdraft changes nothing here
// — a wallet falling through zero crossed the threshold on the way.
//
// Never throws: this runs after a spend that has already committed, and a
// warning email is not worth failing a paid request over.
async function notifyLowBalance(opts: {
  organizationId: string;
  balanceAfter: number;
  cost: number;
}): Promise<void> {
  const { organizationId, balanceAfter, cost } = opts;
  try {
    const topUp = await lastTopUpCredits(organizationId);
    if (topUp === null) return;

    const threshold = topUp * LOW_BALANCE_FRACTION;
    const balanceBefore = balanceAfter + cost;
    if (balanceBefore <= threshold || balanceAfter > threshold) return;

    const owner = await findOwnerToWarn(organizationId);
    if (!owner) {
      console.warn(
        `[billing] organization ${organizationId} is low on credits and has no owner to warn`
      );
      return;
    }

    // There is no request to read the locale cookie from and no per-user locale
    // is stored anywhere, so this resolves to the app's default locale.
    const locale = getLocaleFromRequest();
    await sendEmail({
      to: owner.email,
      subject: emailMessages[locale].lowBalanceSubject,
      react: LowBalance({
        locale,
        userName: owner.name,
        organizationName: owner.organizationName,
        credits: balanceAfter,
        topUpUrl: `${env.FRONTEND_URL}/billing`,
      }),
    });
  } catch (err) {
    // Message only: the spend already succeeded, so this is a delivery problem
    // to notice, not a stack trace to print on every metered request.
    console.error("[billing] low-balance warning failed", {
      organizationId,
      error: err instanceof Error ? err.message : err,
    });
  }
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
  const overdraftLimit = await readOverdraftLimit(organizationId);

  let spend: SpendResult;
  try {
    spend = await db.transaction(async (tx) => {
      // Still one statement: the same UPDATE evaluates the guard and applies the
      // deduction, against the committed value of `credits`, and `rowsAffected`
      // still separates "insufficient" (0) from "applied" (1). Splitting it into
      // a read and a write is what would let two concurrent spends both pass a
      // stale check. With the guard where it is, every successful spend leaves
      // `credits >= -overdraftLimit`, so no number of overlapping requests can
      // push the wallet past the floor.
      const update = await tx.run(
        sql`UPDATE wallet_balance
            SET credits = credits - ${cost}, updated_at = unixepoch()
            WHERE organization_id = ${organizationId}
              AND credits - ${cost} >= ${0 - overdraftLimit}`
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
    // A race loser: the winner's spend is the one that happened, and the winner
    // already sent whatever warning that crossing deserved.
    return await resolveRaceWinner(organizationId, idempotencyKey, "spend", err);
  }

  // Outside the transaction on purpose: an email must not hold the wallet's
  // write lock, and a failed send must not roll back a spend that succeeded.
  await notifyLowBalance({ organizationId, balanceAfter: spend.balanceAfter, cost });
  return spend;
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
