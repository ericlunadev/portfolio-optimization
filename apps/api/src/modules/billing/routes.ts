import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { and, desc, eq, lt } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { db } from "../../db/index.js";
import {
  creditLedger,
  creditPackages,
  payments,
  walletBalance,
} from "../../db/schema.js";
import { authMiddleware } from "../../middleware/auth.js";
import { env } from "../../config/env.js";
import { grantCredits, spendCredit } from "../../lib/billing/spend.js";
import { newIdempotencyKey } from "../../lib/billing/metering.js";
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
    console.error(`[billing] session ${session.id} missing metadata`, session.metadata);
    return;
  }

  const pkg = await db.query.creditPackages.findFirst({
    where: eq(creditPackages.id, packageId),
  });
  if (!pkg) {
    console.error(`[billing] session ${session.id} references unknown package ${packageId}`);
    return;
  }

  const paymentRow = await db.query.payments.findFirst({
    where: eq(payments.externalId, session.id),
  });
  if (!paymentRow) {
    console.error(`[billing] no payments row for session ${session.id}`);
    return;
  }

  // Mark payment succeeded (idempotent — only flip from pending).
  if (paymentRow.status !== "succeeded") {
    await db
      .update(payments)
      .set({ status: "succeeded", completedAt: new Date() })
      .where(eq(payments.id, paymentRow.id));
  }

  // Grant credits idempotently — same idempotencyKey on retry returns the original row.
  await grantCredits({
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
    console.error(`[billing] charge ${charge.id} missing metadata`, charge.metadata);
    return;
  }

  const pkg = await db.query.creditPackages.findFirst({
    where: eq(creditPackages.id, packageId),
  });
  if (!pkg) {
    console.error(`[billing] charge ${charge.id} references unknown package ${packageId}`);
    return;
  }

  const paymentRow = await db.query.payments.findFirst({
    where: eq(payments.externalId, charge.id),
  });
  if (!paymentRow) {
    console.error(`[billing] no payments row for charge ${charge.id}`);
    return;
  }

  if (paymentRow.status !== "succeeded") {
    await db
      .update(payments)
      .set({ status: "succeeded", completedAt: new Date() })
      .where(eq(payments.id, paymentRow.id));
  }

  await grantCredits({
    userId,
    credits: pkg.credits,
    reason: "purchase",
    idempotencyKey: `purchase:cb:${charge.id}`,
    paymentId: paymentRow.id,
  });
}

// ---------- Auth-gated endpoints ----------

app.use("*", authMiddleware);

// GET /api/billing/wallet — current balance
app.get("/wallet", async (c) => {
  const user = c.get("user");
  const row = await db.query.walletBalance.findFirst({
    where: eq(walletBalance.userId, user.id),
  });
  return c.json({
    credits: row?.credits ?? 0,
    updatedAt: row?.updatedAt ?? null,
  });
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
    const rows = await db.query.creditPackages.findMany({
      where: rail
        ? and(eq(creditPackages.isActive, true), eq(creditPackages.rail, rail))
        : eq(creditPackages.isActive, true),
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
    const user = c.get("user");
    const { packageId } = c.req.valid("json");

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
          userId: user.id,
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
      userId: user.id,
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

    const where = cursor
      ? and(eq(creditLedger.userId, user.id), lt(creditLedger.createdAt, new Date(cursor)))
      : eq(creditLedger.userId, user.id);

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

// POST /api/billing/advisor-call — spend credits, reveal the booking URL.
// Idempotent on the Idempotency-Key header so a double-click does not double-charge.
app.post("/advisor-call", async (c) => {
  const user = c.get("user");
  const idempotencyKey = c.req.header("Idempotency-Key") ?? newIdempotencyKey();

  await spendCredit({
    userId: user.id,
    idempotencyKey,
    cost: env.ADVISOR_CALL_COST_CREDITS,
  });

  return c.json({
    bookingUrl: env.ADVISOR_BOOKING_URL,
    costCredits: env.ADVISOR_CALL_COST_CREDITS,
  });
});

export default app;
