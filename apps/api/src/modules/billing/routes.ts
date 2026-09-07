import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { randomUUID, timingSafeEqual } from "node:crypto";
import type Stripe from "stripe";
import { db } from "../../db/index.js";
import {
  creditLedger,
  creditPackages,
  organization,
  organizationMember,
  organizationSettings,
  payments,
  simulations,
  user,
  walletBalance,
} from "../../db/schema.js";
import { authMiddleware } from "../../middleware/auth.js";
import { env } from "../../config/env.js";
import { grantCredits, spendCredit } from "../../lib/billing/spend.js";
import { resolveAdvisorConfig } from "../../lib/advisor.js";
import { clientIdempotencyKey } from "../../lib/billing/metering.js";
import { getStripe, getWebhookSecret } from "./stripe.js";
import {
  createCharge,
  isCoinbaseConfigured,
  verifyWebhookSignature as verifyCoinbaseSignature,
  type CoinbaseCharge,
  type CoinbaseEvent,
  type CoinbaseWebhookEnvelope,
} from "./coinbase.js";

const app = new Hono();

// ---------- Webhooks (must be registered BEFORE auth middleware so Stripe can reach them) ----------

// Stripe webhook. Signature-verified with the raw body. Idempotent — the
// ledger's unique idempotencyKey makes redelivery a no-op.
app.post("/webhooks/stripe", async (c) => {
  const stripe = getStripe();
  const secret = getWebhookSecret();
  if (!stripe || !secret) {
    console.error("[billing] Stripe webhook hit but STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET not configured");
    return c.json({ error: "Stripe not configured" }, 503);
  }

  const signature = c.req.header("stripe-signature");
  if (!signature) {
    return c.json({ error: "Missing stripe-signature header" }, 400);
  }

  // Hono exposes the raw body via c.req.text() — must be called before any JSON parsing.
  const rawBody = await c.req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    console.error("[billing] Stripe webhook signature verification failed:", err);
    return c.json({ error: "Invalid signature" }, 400);
  }

  try {
    await handleStripeEvent(event);
  } catch (err) {
    console.error(`[billing] handler for ${event.type} threw:`, err);
    // Return 500 so Stripe retries — better than silently dropping a successful payment.
    return c.json({ error: "Handler failed" }, 500);
  }

  return c.json({ received: true });
});

async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      await fulfillCheckoutSession(session);
      return;
    }
    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      await markPaymentStatus(session.id, "expired");
      return;
    }
    case "checkout.session.async_payment_failed":
    case "payment_intent.payment_failed": {
      const session = event.data.object as Stripe.Checkout.Session;
      await markPaymentStatus(session.id, "failed");
      return;
    }
    case "charge.refunded":
    case "charge.dispute.created":
    case "charge.dispute.funds_withdrawn":
    case "charge.dispute.closed": {
      // Out-of-band: chargeback, dispute, or admin-issued refund.
      // For v1 we log loudly and let an operator insert a manual reversal ledger row.
      console.error(`[billing] P1: ${event.type} received — manual reversal may be required`, {
        eventId: event.id,
        object: event.data.object,
      });
      return;
    }
    default:
      console.log(`[billing] Stripe event ignored: ${event.type}`);
      return;
  }
}

async function fulfillCheckoutSession(session: Stripe.Checkout.Session): Promise<void> {
  if (session.payment_status !== "paid") {
    console.log(`[billing] session ${session.id} not paid yet (status=${session.payment_status})`);
    return;
  }

  const userId = session.metadata?.userId;
  const packageId = session.metadata?.packageId;
  if (!userId || !packageId) {
    // Returns rather than throws: the metadata is fixed on the session, so no
    // retry can ever succeed. Needs a human, not a 3-day retry loop.
    console.error(`[billing] session ${session.id} missing metadata`, session.metadata);
    return;
  }

  const pkg = await db.query.creditPackages.findFirst({
    where: eq(creditPackages.id, packageId),
  });
  if (!pkg) {
    // Throw, not return: returning 200 drops a paid session silently. The 500
    // this becomes makes Stripe retry, which gives an operator the retry window
    // to seed the missing package.
    throw new Error(`session ${session.id} references unknown package ${packageId}`);
  }

  // The organization comes from the payments row written at checkout — never
  // from the buyer's current membership. Stripe retries for up to 3 days, and a
  // user who moved organization inside that window would otherwise have their
  // firm's purchase credited to the wrong tenant.
  const paymentRow = await db.query.payments.findFirst({
    where: eq(payments.externalId, session.id),
  });
  if (!paymentRow) {
    throw new Error(`no payments row for session ${session.id} — cannot resolve organization`);
  }

  // Mark payment succeeded (idempotent — only flip from pending).
  if (paymentRow.status !== "succeeded") {
    await db
      .update(payments)
      .set({ status: "succeeded", completedAt: new Date() })
      .where(eq(payments.id, paymentRow.id));
  }

  // Grant credits idempotently — same idempotencyKey on retry returns the
  // original row, now looked up within the organization.
  await grantCredits({
    organizationId: paymentRow.organizationId,
    userId,
    credits: pkg.credits,
    reason: "purchase",
    idempotencyKey: `purchase:${session.id}`,
    paymentId: paymentRow.id,
  });
}

async function markPaymentStatus(externalId: string, status: "failed" | "expired"): Promise<void> {
  await db
    .update(payments)
    .set({ status, completedAt: new Date() })
    .where(and(eq(payments.externalId, externalId), eq(payments.status, "pending")));
}

// Coinbase Commerce webhook. Signature: HMAC-SHA256 hex of raw body, header
// X-CC-Webhook-Signature. Idempotent via the same ledger idempotencyKey trick.
app.post("/webhooks/coinbase", async (c) => {
  if (!isCoinbaseConfigured()) {
    console.error("[billing] Coinbase webhook hit but COINBASE_COMMERCE_API_KEY not configured");
    return c.json({ error: "Coinbase not configured" }, 503);
  }

  const signature = c.req.header("x-cc-webhook-signature");
  const rawBody = await c.req.text();

  if (!verifyCoinbaseSignature(rawBody, signature)) {
    console.error("[billing] Coinbase webhook signature verification failed");
    return c.json({ error: "Invalid signature" }, 400);
  }

  let envelope: CoinbaseWebhookEnvelope;
  try {
    envelope = JSON.parse(rawBody) as CoinbaseWebhookEnvelope;
  } catch (err) {
    console.error("[billing] Coinbase webhook body not JSON:", err);
    return c.json({ error: "Invalid body" }, 400);
  }

  try {
    await handleCoinbaseEvent(envelope.event);
  } catch (err) {
    console.error(`[billing] Coinbase handler for ${envelope.event?.type} threw:`, err);
    // 500 → Coinbase retries (up to 3 days), preferable to silently dropping.
    return c.json({ error: "Handler failed" }, 500);
  }

  return c.json({ received: true });
});

async function handleCoinbaseEvent(event: CoinbaseEvent): Promise<void> {
  switch (event.type) {
    case "charge:confirmed": {
      await fulfillCoinbaseCharge(event.data);
      return;
    }
    case "charge:resolved": {
      // Already credited at confirmed; resolved fires after re-org safety window.
      return;
    }
    case "charge:failed": {
      await markPaymentStatus(event.data.id, "failed");
      return;
    }
    case "charge:delayed": {
      // Underpayment / late payment past the window. Treat as expired for v1;
      // operator can manually credit from the Coinbase dashboard if desired.
      await markPaymentStatus(event.data.id, "expired");
      return;
    }
    default:
      console.log(`[billing] Coinbase event ignored: ${event.type}`);
      return;
  }
}

async function fulfillCoinbaseCharge(charge: CoinbaseCharge): Promise<void> {
  const userId = charge.metadata?.userId as string | undefined;
  const packageId = charge.metadata?.packageId as string | undefined;
  if (!userId || !packageId) {
    // Unrecoverable by retry, exactly as in the Stripe path above.
    console.error(`[billing] charge ${charge.id} missing metadata`, charge.metadata);
    return;
  }

  const pkg = await db.query.creditPackages.findFirst({
    where: eq(creditPackages.id, packageId),
  });
  if (!pkg) {
    throw new Error(`charge ${charge.id} references unknown package ${packageId}`);
  }

  // Organization resolved from the payments row, not from membership — see
  // fulfillCheckoutSession.
  const paymentRow = await db.query.payments.findFirst({
    where: eq(payments.externalId, charge.id),
  });
  if (!paymentRow) {
    throw new Error(`no payments row for charge ${charge.id} — cannot resolve organization`);
  }

  if (paymentRow.status !== "succeeded") {
    await db
      .update(payments)
      .set({ status: "succeeded", completedAt: new Date() })
      .where(eq(payments.id, paymentRow.id));
  }

  await grantCredits({
    organizationId: paymentRow.organizationId,
    userId,
    credits: pkg.credits,
    reason: "purchase",
    idempotencyKey: `purchase:cb:${charge.id}`,
    paymentId: paymentRow.id,
  });
}

// ---------- Internal operator endpoints (shared secret, no session) ----------

// A grant is written by an operator for a customer who pays on an invoice. The
// amounts are large by nature, so this cap only has to catch a fat-fingered
// purchase order — a real grant never approaches it.
const MAX_GRANT_CREDITS = 1_000_000;

// Constant-time comparison of the caller's bearer token against
// INTERNAL_API_SECRET.
//
// Read from `process.env` at call time rather than through `config/env.ts`: the
// secret has no entry in that schema yet (see the follow-up), and reading it per
// request is also what lets a test set it. An unset secret matches nothing — the
// middleware answers 503 before it reaches here.
function internalSecretMatches(header: string | undefined): boolean {
  const expected = process.env.INTERNAL_API_SECRET;
  if (!expected) return false;

  const provided = Buffer.from(header?.replace(/^Bearer\s+/i, "") ?? "");
  const secret = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, so lengths are compared first.
  // That leaks the secret's length and nothing else.
  if (provided.length !== secret.length) return false;
  return timingSafeEqual(provided, secret);
}

// **The authority model here is provisional.** There is no platform-admin
// concept in this API to hang an admin role off — `user` has no role column,
// `organization_member.role` is a role *inside* one tenant, and BetterAuth runs
// with `plugins: [expo()]` only. So the guard is the shared secret CRON.md
// already proposes for internal routes: it needs no new auth concept and is
// unreachable from any browser session. PLAN §9.5 escalates what the real model
// should be; whoever answers it replaces this middleware, not the handler below.
app.use("/internal/*", async (c, next) => {
  if (!process.env.INTERNAL_API_SECRET) {
    console.error("[billing] internal route hit but INTERNAL_API_SECRET is not configured");
    return c.json({ error: "Internal API not configured" }, 503);
  }
  if (!internalSecretMatches(c.req.header("Authorization"))) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
});

// POST /api/billing/internal/grant — credit an organization's wallet.
//
// This is how an invoiced customer gets credits: they pay a net-30 purchase
// order and an operator runs this, which lands a `reason: 'grant'` ledger row
// with no acting user. D8 says a tenant's end users never transact, so without
// this route a whitelabel tenant has no way to be topped up at all.
app.post(
  "/internal/grant",
  zValidator(
    "json",
    z.object({
      organizationId: z.string().min(1),
      credits: z.number().int().positive().max(MAX_GRANT_CREDITS),
      // The purchase order or invoice number, and the idempotency key: re-running
      // the same grant after a timeout must be a no-op rather than a second gift,
      // and there is no key this handler could safely invent for itself.
      reference: z.string().min(1).max(200),
      note: z.string().max(500).optional(),
    })
  ),
  async (c) => {
    const { organizationId, credits, reference, note } = c.req.valid("json");

    // Checked before the write: `grantCredits` would otherwise fail on the
    // foreign key and surface as a 500, which reads like our bug rather than a
    // mistyped organization id.
    const org = await db.query.organization.findFirst({
      where: eq(organization.id, organizationId),
      columns: { id: true, slug: true },
    });
    if (!org) {
      return c.json({ error: "Organization not found" }, 404);
    }

    const result = await grantCredits({
      organizationId,
      // No acting user: the grant is ours, not any analyst's. Attributing it to
      // one would also drop it into that person's own ledger view.
      userId: null,
      credits,
      reason: "grant",
      idempotencyKey: `grant:${reference}`,
    });

    // The grant is idempotent on the reference, so a repeat returns the original
    // row instead of granting again. Report what that row holds rather than what
    // was asked for: an operator re-sending a corrected amount under the same
    // purchase order has granted nothing, and needs to see that in the answer.
    const written = await db.query.creditLedger.findFirst({
      where: eq(creditLedger.id, result.ledgerId),
      columns: { delta: true },
    });
    const granted = written?.delta ?? credits;

    console.log(
      `[billing] grant ref=${reference} on organization ${org.slug} (${organizationId}): ${granted} credits${
        granted === credits ? "" : ` (requested ${credits}, reference already used)`
      }${note ? `, note=${note}` : ""}`
    );

    return c.json({
      organizationId,
      credits: granted,
      reference,
      ledgerId: result.ledgerId,
      balanceAfter: result.balanceAfter,
    });
  }
);

// ---------- Auth-gated endpoints ----------

app.use("*", authMiddleware);

// GET /api/billing/wallet — current balance
app.get("/wallet", async (c) => {
  const row = await db.query.walletBalance.findFirst({
    where: eq(walletBalance.organizationId, c.get("organizationId")),
  });
  return c.json({
    credits: row?.credits ?? 0,
    updatedAt: row?.updatedAt ?? null,
  });
});

type Rail = "stripe" | "coinbase_commerce";

// Which payment rails this tenant may use (PLAN Task 2.7).
//
// Card is always on. Crypto is a switch because a corporate finance department
// pays by card or on an invoice, and a "Pay with crypto" tab in a whitelabel app
// is at best noise and at worst a compliance conversation. The column defaults to
// false and a missing settings row means the same: off unless a tenant is
// deliberately opted in.
async function availableRails(organizationId: string): Promise<Rail[]> {
  const settings = await db.query.organizationSettings.findFirst({
    where: eq(organizationSettings.organizationId, organizationId),
    columns: { cryptoRailEnabled: true },
  });
  return settings?.cryptoRailEnabled ? ["stripe", "coinbase_commerce"] : ["stripe"];
}

// GET /api/billing/rails — the rails this organization may pay with.
//
// The client needs the answer before it renders the rail tabs, and the packages
// endpoint cannot give it: an empty list there is indistinguishable from a rail
// nobody has seeded packages for.
app.get("/rails", async (c) => {
  return c.json({ rails: await availableRails(c.get("organizationId")) });
});

// GET /api/billing/packages?rail=stripe — active packages
app.get(
  "/packages",
  zValidator(
    "query",
    z.object({
      rail: z.enum(["stripe", "coinbase_commerce"]).optional(),
    })
  ),
  async (c) => {
    const { rail } = c.req.valid("query");
    // Filtered by the tenant's rails, not only by the query parameter, so a
    // gated rail's packages never reach a client that asks for the whole list.
    const rails = await availableRails(c.get("organizationId"));
    if (rail && !rails.includes(rail)) {
      return c.json([]);
    }

    const rows = await db.query.creditPackages.findMany({
      where: rail
        ? and(eq(creditPackages.isActive, true), eq(creditPackages.rail, rail))
        : and(eq(creditPackages.isActive, true), inArray(creditPackages.rail, rails)),
      orderBy: [creditPackages.sortOrder],
    });
    return c.json(
      rows.map((r) => ({
        id: r.id,
        credits: r.credits,
        priceMinor: r.priceMinor,
        currency: r.currency,
        rail: r.rail,
      }))
    );
  }
);

// POST /api/billing/checkout — create a Stripe Checkout Session
app.post(
  "/checkout",
  zValidator(
    "json",
    z.object({
      packageId: z.string().min(1),
    })
  ),
  async (c) => {
    const user = c.get("user");
    const { packageId } = c.req.valid("json");

    const stripe = getStripe();
    if (!stripe) {
      throw new HTTPException(503, { message: "Stripe not configured" });
    }

    const pkg = await db.query.creditPackages.findFirst({
      where: and(
        eq(creditPackages.id, packageId),
        eq(creditPackages.isActive, true),
        eq(creditPackages.rail, "stripe")
      ),
    });
    if (!pkg || !pkg.stripePriceId) {
      throw new HTTPException(404, { message: "Package not found" });
    }

    const paymentId = randomUUID();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: pkg.stripePriceId, quantity: 1 }],
      success_url: `${env.FRONTEND_URL}/billing?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.FRONTEND_URL}/billing?status=cancelled`,
      customer_email: user.email,
      // Locale follows the user's app locale; default to Spanish per CLAUDE.md.
      locale: c.req.header("Accept-Language")?.startsWith("en") ? "en" : "es",
      metadata: {
        userId: user.id,
        packageId: pkg.id,
        paymentId,
      },
      payment_intent_data: {
        metadata: {
          userId: user.id,
          packageId: pkg.id,
          paymentId,
        },
      },
    });

    await db.insert(payments).values({
      id: paymentId,
      userId: user.id,
      // Stamped here so the webhook can resolve the organization from this row
      // without a session.
      organizationId: c.get("organizationId"),
      packageId: pkg.id,
      rail: "stripe",
      externalId: session.id,
      status: "pending",
      amountMinor: pkg.priceMinor,
      currency: pkg.currency,
      creditsPurchased: pkg.credits,
    });

    if (!session.url) {
      throw new HTTPException(502, { message: "Stripe did not return a checkout URL" });
    }
    return c.json({ url: session.url });
  }
);

// POST /api/billing/crypto/checkout — create a Coinbase Commerce charge
app.post(
  "/crypto/checkout",
  zValidator(
    "json",
    z.object({
      packageId: z.string().min(1),
    })
  ),
  async (c) => {
    const currentUser = c.get("user");
    const organizationId = c.get("organizationId");
    const { packageId } = c.req.valid("json");

    // The tenant's own switch is checked before the platform's configuration:
    // whether we hold Coinbase credentials is irrelevant to an organization that
    // does not offer the rail. 404 rather than 403, matching /advisor-call — the
    // rail does not exist for this tenant, so neither does the endpoint.
    if (!(await availableRails(organizationId)).includes("coinbase_commerce")) {
      throw new HTTPException(404, {
        message: "Crypto payment is not available for this organization",
      });
    }

    if (!isCoinbaseConfigured()) {
      throw new HTTPException(503, { message: "Coinbase not configured" });
    }

    const pkg = await db.query.creditPackages.findFirst({
      where: and(
        eq(creditPackages.id, packageId),
        eq(creditPackages.isActive, true),
        eq(creditPackages.rail, "coinbase_commerce")
      ),
    });
    if (!pkg) {
      throw new HTTPException(404, { message: "Package not found" });
    }

    const paymentId = randomUUID();
    const amountUsd = (pkg.priceMinor / 100).toFixed(2);

    let charge: CoinbaseCharge;
    try {
      charge = await createCharge({
        name: `${pkg.credits} créditos`,
        description: `${pkg.credits} corridas de optimización`,
        amountUsd,
        metadata: {
          userId: currentUser.id,
          packageId: pkg.id,
          paymentId,
        },
        redirectUrl: `${env.FRONTEND_URL}/billing?status=success`,
        cancelUrl: `${env.FRONTEND_URL}/billing?status=cancelled`,
      });
    } catch (err) {
      console.error("[billing] Coinbase createCharge failed:", err);
      throw new HTTPException(502, { message: "Coinbase did not return a charge" });
    }

    await db.insert(payments).values({
      id: paymentId,
      userId: currentUser.id,
      organizationId,
      packageId: pkg.id,
      rail: "coinbase_commerce",
      externalId: charge.id,
      status: "pending",
      amountMinor: pkg.priceMinor,
      currency: pkg.currency,
      creditsPurchased: pkg.credits,
    });

    return c.json({ url: charge.hosted_url });
  }
);

// GET /api/billing/ledger?cursor=...&limit=... — paginated history
app.get(
  "/ledger",
  zValidator(
    "query",
    z.object({
      cursor: z.coerce.number().optional(),
      limit: z.coerce.number().min(1).max(100).default(50),
    })
  ),
  async (c) => {
    const user = c.get("user");
    const { cursor, limit } = c.req.valid("query");

    // Organization first, then the caller's own rows. The organization predicate
    // is not redundant: a user who changed organization keeps their old rows,
    // and those belong to the previous tenant.
    //
    // This stays a personal view on purpose (PLAN Task 2.4). It is the answer to
    // "what have I spent", and an analyst has no business reading what their
    // colleagues spend. The consequence is that the org-wide balance above it
    // cannot be reconciled from these deltas alone — rows belonging to other
    // members, and rows whose user was deleted (`user_id` set null), are not
    // here. `GET /api/billing/usage` is the reconcilable view, and only an owner
    // may read it.
    const mine = and(
      eq(creditLedger.organizationId, c.get("organizationId")),
      eq(creditLedger.userId, user.id)
    );
    const where = cursor
      ? and(mine, lt(creditLedger.createdAt, new Date(cursor)))
      : mine;

    const rows = await db.query.creditLedger.findMany({
      where,
      orderBy: [desc(creditLedger.createdAt)],
      limit: limit + 1,
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1].createdAt?.getTime() ?? null : null;

    return c.json({
      items: items.map((r) => ({
        id: r.id,
        delta: r.delta,
        reason: r.reason,
        balanceAfter: r.balanceAfter,
        paymentId: r.paymentId,
        simulationId: r.simulationId,
        createdAt: r.createdAt,
      })),
      nextCursor,
    });
  }
);

// `owner` is the only role that may read the whole tenant's spending —
// the same rule `GET /api/organizations/export` applies to the whole tenant's
// data. Duplicated rather than imported while both files are in flight; see the
// follow-up about hoisting it.
async function isOwner(organizationId: string, userId: string): Promise<boolean> {
  const membership = await db.query.organizationMember.findFirst({
    where: and(
      eq(organizationMember.organizationId, organizationId),
      eq(organizationMember.userId, userId)
    ),
    columns: { role: true },
  });

  return membership?.role === "owner";
}

/** `integer(mode: "timestamp")` columns hold seconds; raw aggregates return them unconverted. */
function epochSecondsToIso(seconds: number | null): string | null {
  if (seconds === null || seconds === undefined) return null;
  return new Date(Number(seconds) * 1000).toISOString();
}

// GET /api/billing/usage — who in this organization is spending the credits.
//
// The owner's view, and the main thing an org owner signs in for: they are
// invoiced for one shared wallet (D7) and need to see which seats it went to.
//
// Deliberately org-wide, where `/ledger` is deliberately personal. That split is
// what makes the numbers add up: a member sees an org-wide balance above their
// own subset of rows, so the reconcilable view has to exist somewhere, and the
// owner is the only person entitled to it. Ledger rows whose user is gone
// (`user_id` set null on delete) count towards the wallet and appear in no
// member's ledger at all; here they are a row of their own with `userId: null`,
// which the client renders as a former member rather than dropping.
app.get(
  "/usage",
  zValidator(
    "query",
    z.object({
      limit: z.coerce.number().min(1).max(100).default(20),
    })
  ),
  async (c) => {
    const organizationId = c.get("organizationId");
    const currentUser = c.get("user");
    const { limit } = c.req.valid("query");

    if (!(await isOwner(organizationId, currentUser.id))) {
      return c.json({ error: "Only an organization owner can view usage" }, 403);
    }

    const [seats, ledgerByUser, simulationsByUser, wallet, recentRows] = await Promise.all([
      db
        .select({
          userId: organizationMember.userId,
          role: organizationMember.role,
          name: user.name,
          email: user.email,
        })
        .from(organizationMember)
        .innerJoin(user, eq(user.id, organizationMember.userId))
        .where(eq(organizationMember.organizationId, organizationId)),

      // One grouped pass over the ledger. `spent` is reported positive because
      // "spent 12 credits" is the sentence the owner is reading.
      db
        .select({
          userId: creditLedger.userId,
          spent: sql<number>`coalesce(sum(case when ${creditLedger.delta} < 0 then -${creditLedger.delta} else 0 end), 0)`,
          added: sql<number>`coalesce(sum(case when ${creditLedger.delta} > 0 then ${creditLedger.delta} else 0 end), 0)`,
          runs: sql<number>`coalesce(sum(case when ${creditLedger.reason} = 'spend' then 1 else 0 end), 0)`,
          lastActivityAt: sql<number | null>`max(${creditLedger.createdAt})`,
        })
        .from(creditLedger)
        .where(eq(creditLedger.organizationId, organizationId))
        .groupBy(creditLedger.userId),

      db
        .select({
          userId: simulations.userId,
          saved: sql<number>`count(*)`,
        })
        .from(simulations)
        .where(eq(simulations.organizationId, organizationId))
        .groupBy(simulations.userId),

      db.query.walletBalance.findFirst({
        where: eq(walletBalance.organizationId, organizationId),
      }),

      db.query.creditLedger.findMany({
        where: eq(creditLedger.organizationId, organizationId),
        orderBy: [desc(creditLedger.createdAt)],
        limit,
      }),
    ]);

    // Names for people who show up in the ledger but hold no seat here today:
    // an analyst who moved organization, whose rows stay with the tenant that
    // paid for them.
    const seatIds = new Set(seats.map((s) => s.userId));
    const strangerIds = [
      ...new Set(
        [...ledgerByUser, ...simulationsByUser]
          .map((r) => r.userId)
          .filter((id): id is string => id !== null && !seatIds.has(id))
      ),
    ];
    const strangers = strangerIds.length
      ? await db
          .select({ id: user.id, name: user.name, email: user.email })
          .from(user)
          .where(inArray(user.id, strangerIds))
      : [];

    // `role: null` for a stranger: they hold no seat here, so they have no role
    // in this organization.
    const identities = new Map<string, { name: string; email: string; role: string | null }>([
      ...seats.map(
        (s) => [s.userId, { name: s.name, email: s.email, role: s.role }] as const
      ),
      ...strangers.map(
        (s) => [s.id, { name: s.name, email: s.email, role: null }] as const
      ),
    ]);

    const ledgerById = new Map(ledgerByUser.map((r) => [r.userId, r]));
    const simulationsById = new Map(simulationsByUser.map((r) => [r.userId, Number(r.saved)]));

    // Every id that owes the owner a row: current seats, plus anyone with
    // activity who is no longer one — including the null bucket.
    const rowIds: (string | null)[] = [
      ...seats.map((s) => s.userId),
      ...strangerIds,
      ...(ledgerById.has(null) || simulationsById.has(null) ? [null] : []),
    ];

    const members = rowIds
      .map((userId) => {
        const activity = ledgerById.get(userId);
        const identity = userId === null ? null : identities.get(userId) ?? null;
        return {
          userId,
          name: identity?.name ?? null,
          email: identity?.email ?? null,
          role: identity?.role ?? null,
          // False for the null bucket and for anyone who moved on. The client
          // labels those rows instead of showing a blank name.
          isCurrentMember: userId !== null && seatIds.has(userId),
          spent: Number(activity?.spent ?? 0),
          added: Number(activity?.added ?? 0),
          runs: Number(activity?.runs ?? 0),
          simulations: simulationsById.get(userId) ?? 0,
          lastActivityAt: epochSecondsToIso(activity?.lastActivityAt ?? null),
        };
      })
      .sort((a, b) => b.spent - a.spent || (a.name ?? "").localeCompare(b.name ?? ""));

    return c.json({
      totals: {
        balance: wallet?.credits ?? 0,
        spent: members.reduce((sum, m) => sum + m.spent, 0),
        added: members.reduce((sum, m) => sum + m.added, 0),
        runs: members.reduce((sum, m) => sum + m.runs, 0),
        simulations: members.reduce((sum, m) => sum + m.simulations, 0),
        seats: seats.length,
      },
      members,
      recent: recentRows.map((r) => ({
        id: r.id,
        delta: r.delta,
        reason: r.reason,
        balanceAfter: r.balanceAfter,
        simulationId: r.simulationId,
        createdAt: r.createdAt,
        // The actor column. Null means the row outlived its user — a grant we
        // wrote for the organization, or a departed analyst's spend.
        actor: r.userId === null ? null : { userId: r.userId, name: identities.get(r.userId)?.name ?? null },
      })),
    });
  }
);

// POST /api/billing/advisor-call — spend credits, reveal the booking URL.
// Idempotent on the Idempotency-Key header so a double-click does not double-charge.
//
// Both the destination and the price come from the caller's organization, not
// from env: on a tenant's branded app the platform's advisor is the wrong
// answer. See `lib/advisor.ts` and PLAN Task 3.3.
app.post("/advisor-call", async (c) => {
  const user = c.get("user");
  const organizationId = c.get("organizationId");
  const idempotencyKey = clientIdempotencyKey(c.req.header("Idempotency-Key"));

  // Resolved before the spend. An organization with the CTA switched off, or a
  // tenant that has not configured a booking URL, has no advisor call to sell —
  // 404 rather than charging for a link that does not exist.
  const advisor = await resolveAdvisorConfig(organizationId);
  if (!advisor.bookable || advisor.bookingUrl === null) {
    throw new HTTPException(404, {
      message: "Advisor booking is not available for this organization",
    });
  }

  await spendCredit({
    organizationId,
    userId: user.id,
    idempotencyKey,
    cost: advisor.costCredits,
  });

  return c.json({
    bookingUrl: advisor.bookingUrl,
    costCredits: advisor.costCredits,
  });
});

export default app;
