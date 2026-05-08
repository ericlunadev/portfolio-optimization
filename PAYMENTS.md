# Payments — Implementation Plan

Status: **proposal**. Nothing in this doc is shipped yet. Open questions are at the bottom.

## 1. Goals & non-goals

**Goals**

- A user can buy **credits** with fiat (card, **USD only**) and with stablecoins (**USDC / USDT**), per `TODO.md`.
- One **optimization run = 1 credit**. The user is blocked from running an optimization with zero balance.
- Every credit movement is reconstructable from an append-only ledger — no balance-only state.

**Non-goals (for v1)**

- Subscriptions / recurring billing. Pure pay-as-you-go.
- Multi-tenant / org wallets. One wallet per user.
- Promo codes, referral credits, tiered free quotas. (Easy to add later via the ledger.)
- **Refunds, cash-out, or any return of credit value to the user.** All sales are final. Credits are non-refundable and non-transferable. This must be stated explicitly at checkout. Avoids the regulatory and operational scope of payouts/refunds entirely for v1.
- Local-currency pricing. Packages are priced in **USD** only; users in MX pay in USD on their card (their issuer handles FX). Revisit if MX conversion proves to be a real blocker.

## 2. What counts as a "run"

A run is exactly one successful response from one of these endpoints (all live in `apps/api/src/modules/optimization/routes.ts`):

| Endpoint | Verb | Cost (credits) |
| --- | --- | --- |
| `/api/optimization/optimize` | POST | 1 |
| `/api/optimization/min-variance-tickers` | POST | 1 |
| `/api/optimization/max-sharpe-tickers` | POST | 1 |
| `/api/optimization/efficient-frontier-tickers` | POST | 1 (open Q — see §11) |
| `/api/optimization/cumulative-returns-tickers` | POST | 0 (read-only viz) |
| `/api/optimization/rolling-volatility-tickers` | POST | 0 (read-only viz) |
| `/api/optimization/neg-return-prob` | POST | 0 (cheap pure math) |

Rule of thumb for what gets metered: anything that computes a portfolio. Anything that just renders a chart from a portfolio the user already has does not.

We **deduct on success only**. If the optimizer throws, no credit is burned. Implementation-wise that means: deduct the credit *before* the heavy work but inside a DB transaction, and **reverse via the ledger** if the work fails (see §6).

## 3. Schema additions

Follow the existing migration workflow in `CLAUDE.md`: edit `apps/api/src/db/schema.ts`, run `pnpm db:generate` from `apps/api/`, commit the migration file, let Render run `pnpm db:migrate` on deploy. Never `db:push` in CI.

All tables are SQLite/libSQL via Drizzle. Money is stored in **integer minor units** (USD cents for fiat, 6-decimal microdollars for stablecoins). No floats for money.

```ts
// One row per user. Source of truth for "can they run an optimization right now?"
// Always reconcilable against creditLedger via SUM(delta).
export const walletBalance = sqliteTable("wallet_balance", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  credits: integer("credits").notNull().default(0), // never negative
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
});

// Append-only. Every credit movement (purchase, spend, grant, reversal).
export const creditLedger = sqliteTable(
  "credit_ledger",
  {
    id: text("id").primaryKey(), // UUID
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    delta: integer("delta").notNull(), // +N purchase/grant/reversal-of-spend, -N spend
    reason: text("reason").notNull(), // 'purchase' | 'spend' | 'grant' | 'reversal'
    paymentId: text("payment_id").references(() => payments.id),
    simulationId: text("simulation_id").references(() => simulations.id),
    // Prevents double-charging from webhook or client retries.
    idempotencyKey: text("idempotency_key").unique(),
    balanceAfter: integer("balance_after").notNull(), // snapshot after this row applied
    createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
  },
  (t) => [index("ledger_user_idx").on(t.userId), index("ledger_created_idx").on(t.createdAt)]
);

// Catalog of buyable packages. Editable without code deploy.
export const creditPackages = sqliteTable("credit_packages", {
  id: text("id").primaryKey(), // 'pack_starter', 'pack_pro', ...
  credits: integer("credits").notNull(),
  priceMinor: integer("price_minor").notNull(), // USD cents for fiat, 1e-6 units for USDC/USDT
  currency: text("currency").notNull(), // 'USD' | 'USDC' | 'USDT'
  rail: text("rail").notNull(), // 'stripe' | 'coinbase_commerce'
  stripePriceId: text("stripe_price_id"), // null for crypto-only packs
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

// One per purchase attempt. Created when a checkout session is requested,
// transitions to 'succeeded' from a verified webhook (never from the client).
export const payments = sqliteTable("payments", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id),
  packageId: text("package_id").references(() => creditPackages.id),
  rail: text("rail").notNull(), // 'stripe' | 'coinbase_commerce'
  externalId: text("external_id").unique(), // Stripe Checkout Session id / Coinbase charge id
  status: text("status").notNull().default("pending"), // pending | succeeded | failed | expired
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency").notNull(),
  creditsPurchased: integer("credits_purchased").notNull(),
  metadata: text("metadata"), // JSON blob for raw provider payload references
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
  completedAt: integer("completed_at", { mode: "timestamp" }),
});
```

No `payouts` table in v1 — see §7. If we ever ship payouts, it gets its own migration.

**Invariant:** for any user, `walletBalance.credits == SUM(creditLedger.delta)`. Add a periodic reconciliation job (or a startup check in dev) that asserts this — if it ever drifts, that's a P0 data-integrity bug.

**Why a ledger and not just `walletBalance.credits`?** Because "the user is yelling that they were charged twice" needs an answer that survives a DB restore. The wallet is a cache. The ledger is the truth.

## 4. Payment rails

Two rails, both webhook-driven, both write the same `payments` row shape:

### 4.1 Stripe (fiat — USD only)

- **Stripe Checkout** (hosted page) — minimal PCI surface, accepts cards from MX & US (and most other countries), supports localized UI (`locale: 'es' | 'en'`). Charged in **USD**; the issuing bank handles FX for non-US cards.
- Pre-create `Price` objects in Stripe for each fiat package (all in USD); store the `price_id` in `creditPackages.stripePriceId`.
- Endpoint: `POST /api/billing/checkout` — creates a Checkout Session, returns the URL, web redirects to it.
- Webhook: `POST /api/billing/webhooks/stripe` — raw body, **must verify `Stripe-Signature`**, handle:
  - `checkout.session.completed` → mark `payments.status = 'succeeded'`, ledger `+credits` with `reason='purchase'`.
  - `checkout.session.expired` / `payment_intent.payment_failed` → `payments.status = 'failed'/'expired'`, no ledger row.
  - `charge.refunded` / `charge.dispute.*` → we don't initiate refunds (§7), so any inbound refund event is **out-of-band** (chargeback, manual Stripe dashboard action, fraud reversal). Log a P1 alert and clamp the user's wallet by inserting a corrective ledger row with `reason='reversal'` to keep the invariant in §3 intact.

### 4.2 Coinbase Commerce (stablecoin — USDC, USDT)

- We pick **Coinbase Commerce** over rolling our own on-chain listener for v1: webhook-based, multi-chain (Base, Polygon, Ethereum), no key custody, simple refund API.
- Endpoint: `POST /api/billing/crypto/checkout` — creates a Charge, returns the hosted URL.
- Webhook: `POST /api/billing/webhooks/coinbase` — verify `X-CC-Webhook-Signature` (HMAC-SHA256 against shared secret).
  - `charge:confirmed` → ledger `+credits` with `reason='purchase'`.
  - `charge:resolved` (after re-org safety window) → no-op, already credited.
  - `charge:failed` / `charge:delayed` → leave pending or mark failed.

### 4.3 Why not Stripe-only with their crypto support?

Stripe's stablecoin-pay product is US-only and locked to a small set of chains. Coinbase Commerce is broader and is the standard for this use case. Revisit when Stripe expands coverage.

## 5. API surface

All under `/api/billing`, all gated by `authMiddleware` except webhooks (which verify their own signatures). New module: `apps/api/src/modules/billing/routes.ts`, mounted in `apps/api/src/index.ts`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/billing/wallet` | `{ credits, updatedAt }` |
| `GET` | `/api/billing/packages?rail=stripe` | Active packages filtered by rail (or all), ordered by `sortOrder`. Prices are USD / USDC / USDT |
| `POST` | `/api/billing/checkout` | Body `{ packageId }` → `{ url }` (Stripe Checkout) |
| `POST` | `/api/billing/crypto/checkout` | Body `{ packageId }` → `{ url }` (Coinbase Commerce) |
| `GET` | `/api/billing/ledger?cursor=...` | Paginated history for the receipts/billing page |
| `POST` | `/api/billing/webhooks/stripe` | Webhook (NO auth middleware, signature-verified) |
| `POST` | `/api/billing/webhooks/coinbase` | Webhook (NO auth middleware, signature-verified) |

No refund endpoint — see §7. All sales are final.

**Important:** webhooks must read the **raw body** for signature verification. Hono parses JSON by default — register webhook routes before any global JSON parser, or use `c.req.raw.text()` and verify before parsing.

## 6. Spending a credit (the hot path)

Add a small helper in `apps/api/src/lib/billing/spend.ts`:

```ts
// Returns the ledger row id on success, throws HTTPException(402) on insufficient balance.
export async function spendCredit(opts: {
  userId: string;
  idempotencyKey: string; // e.g. `${userId}:${requestId}`
  cost: number;           // currently always 1; future-proof
}): Promise<{ ledgerId: string; balanceAfter: number }>;

// Used when the optimization throws after the credit was already deducted.
export async function reverseSpend(ledgerId: string, reason: string): Promise<void>;
```

`spendCredit` runs a single transaction:
1. `UPDATE wallet_balance SET credits = credits - :cost WHERE user_id = :userId AND credits >= :cost` — check `rowsAffected == 1`. This is the atomic gate; if zero rows updated, throw 402.
2. `INSERT INTO credit_ledger (delta = -cost, reason='spend', balance_after, idempotency_key)`. The unique constraint on `idempotencyKey` makes the whole flow idempotent — a retried HTTP request with the same key is a no-op.
3. Return the ledger id so the caller can attach `simulationId` later (via UPDATE) once the optimization completes.

Wire it into the metered endpoints in `optimization/routes.ts`:

```ts
optimization.post("/optimize", zValidator(...), async (c) => {
  const user = c.get("user");
  const idempotencyKey = c.req.header("Idempotency-Key") ?? crypto.randomUUID();
  const spend = await spendCredit({ userId: user.id, idempotencyKey, cost: 1 });

  try {
    const result = /* existing optimization logic */;
    // (optional) UPDATE credit_ledger SET simulation_id = ? WHERE id = spend.ledgerId
    return c.json(result);
  } catch (err) {
    await reverseSpend(spend.ledgerId, "optimization_failed");
    throw err;
  }
});
```

A 402 response from the API is the signal the web app uses to show the "You're out of credits" CTA inline — handle it in `apps/web/src/lib/api.ts`'s `handleResponse` and surface a typed error the optimization page can branch on.

## 7. No refunds, no cash-out — policy

**All credit sales are final.** v1 ships with no user-initiated refund flow and no cash-out. This is a deliberate scope cut, not an oversight:

- **Cash-out to any bank/wallet** = stored value + money transmission. US state MTL licensing in most states; MX Ley Fintech / IFPE license. Months of legal work, capital requirements, AML/KYC, ongoing compliance. Not happening in v1.
- **Refund to original payment method** is technically lighter (it's just a partial refund of a goods-and-services purchase, which Stripe and Coinbase Commerce both support natively), but it still adds: a refund UI, eligibility rules, dispute handling, FX-swing exposure on the stablecoin side, and a support surface. We're cutting it from v1 to keep scope tight.

**Required UI/UX consequences (must ship with v1, not later):**

- Checkout page must display a clear, prominent **"All sales are final. Credits are non-refundable and non-transferable."** Spanish: **"Todas las ventas son finales. Los créditos no son reembolsables ni transferibles."** Place it next to the buy button, not buried in a ToS link.
- Add the same clause to Terms of Service. Require an explicit checkbox or click-through acknowledgement at first purchase.
- Credits do not expire (see §9), so the user always retains usable value — that's the offset for "no refunds."

**Out-of-band refunds will still happen** (chargebacks, fraud reversals, manual Stripe dashboard issues by an admin). The webhook handlers in §4.1 / §4.2 must keep the ledger consistent when this happens by inserting a `reason='reversal'` row — but no user-facing endpoint triggers them.

If we later decide to offer refunds, it's a roadmap item with its own design (eligibility window, partial vs full, rail mapping) and a `payouts` table. Not part of this plan.

## 8. Concurrency, idempotency, abuse

- **Atomic decrement** via the conditional `UPDATE` shown in §6 — no read-then-write race. SQLite/libSQL serialize writes, so this is safe even under burst load.
- **Idempotency keys** on every ledger row prevent double-credit from webhook retries (Stripe retries up to 3 days) and double-debit from client retries.
- **Webhook signatures** are mandatory. Any unverified webhook is dropped with a 400 — log it to whatever observability we add later.
- **Race between purchase and spend:** none. Purchases insert ledger rows; spends do conditional updates. They commute.
- **Abuse:** require `emailVerified === true` (BetterAuth already enforces this on signup) before allowing checkout. Stripe Radar handles card fraud. For crypto, set Coinbase Commerce's `pricing_type: 'fixed_price'` to avoid weird overpayment edge cases.

## 9. Pricing & free-tier

- **Free signup grant:** 3 credits, dropped via a ledger row with `reason='grant'` from the `userProfile` onboarding completion handler. Lets a new user actually try the product before paying.
- **Packages (placeholder — needs business call). Priced in USD; stablecoin packs are 1:1 with the USD pack.**

  | Pack | Credits | Fiat (USD) | Stablecoin (USDC/USDT) |
  | --- | --- | --- | --- |
  | Starter | 10 | $5 | 5 |
  | Pro | 50 | $20 | 20 |
  | Power | 200 | $70 | 70 |

- **Credits do not expire.** Customer-friendly, accounting-simple, removes the "where did my balance go" support ticket. This is also the offset for the no-refunds policy — the user keeps the value indefinitely.

## 10. Frontend

`apps/web/src/app/(app)/billing/page.tsx` is the new page. Subroutes can stay flat — no `[id]` needed for v1.

UI surfaces:
1. **Wallet card** — current balance, with a CTA to buy more.
2. **Package picker** — fetches `/api/billing/packages`. Two tabs: "Tarjeta" (Stripe, USD) and "Cripto" (Coinbase Commerce, USDC/USDT). Prices shown in USD only; non-US users see a small note that their card will be charged in USD and FX is handled by their bank. Each card → POSTs to the relevant checkout endpoint, redirects to provider.
3. **Ledger / receipts** — paginated table from `/api/billing/ledger`. Date in **DD/MM/YYYY** per `CLAUDE.md`. Columns: date, type (purchase/spend/grant/reversal), credits delta, balance after, link to provider receipt for purchases.
4. **No refund UI.** The checkout step must surface the "All sales are final. Credits are non-refundable and non-transferable." copy from §7 — both as inline text next to the pay button and as a required acknowledgement on the user's first purchase.

Cross-cutting:
- **i18n only** — all strings via `useTranslations()`, keys added to **both** `apps/web/messages/es.json` and `apps/web/messages/en.json`. Spanish is the default; the `LocaleSwitcher` already handles the toggle.
- **Nav:** add "Saldo" / "Billing" entry with a wallet icon — must land in **both** `Sidebar.tsx` and `MobileTabBar.tsx` (these are kept in sync).
- **402 handling:** when an optimization call returns 402, show an inline banner on the optimization page with "Comprar créditos" → links to `/billing`. Do not silently navigate.
- **Header chip:** small "X créditos" pill in the app header that links to `/billing`. Powered by a React Query subscription to `/api/billing/wallet` so it updates after a run.

## 11. Open questions

1. **Pricing per run.** Is a full efficient-frontier (50-point sweep) really the same cost as a single max-Sharpe? It's ~50× the compute. Options: keep flat at 1 credit (simpler UX), tier it (frontier = 2, single = 1), or meter by compute time. Recommend flat-1 until we have signal; bump if it gets abused.
2. **Free grant size.** 3? 5? 10? Trade-off between conversion uplift and giveaway cost. Default to 3, A/B later.
3. **USD-only friction in MX.** Charging non-US cards in USD means the user sees the FX line item from their bank, not from us. If conversion in MX is materially worse than US we may need to revisit and add MXN as a billing currency — but that's deferred until we have signal.
4. **Admin tooling.** Manual grants and `reason='reversal'` ledger writes for chargebacks/fraud will be needed eventually. Build minimal UI when the first real case appears. TODO LATER


## 13. Files we'll touch

New:
- `apps/api/src/modules/billing/routes.ts`
- `apps/api/src/modules/billing/stripe.ts`
- `apps/api/src/modules/billing/coinbase.ts`
- `apps/api/src/lib/billing/spend.ts`
- `apps/api/src/lib/billing/ledger.ts`
- `apps/api/drizzle/000X_payments.sql` (generated)
- `apps/web/src/app/(app)/billing/page.tsx`
- `apps/web/src/components/billing/*` (wallet card, package picker, ledger table, sales-final acknowledgement)

Modified:
- `apps/api/src/db/schema.ts` — new tables + relations
- `apps/api/src/index.ts` — mount `/api/billing`
- `apps/api/src/modules/optimization/routes.ts` — wrap metered endpoints with `spendCredit` / `reverseSpend`
- `apps/api/src/config/env.ts` — `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `COINBASE_COMMERCE_API_KEY`, `COINBASE_COMMERCE_WEBHOOK_SECRET`
- `apps/api/package.json` — add `stripe` SDK
- `apps/web/src/lib/api.ts` — billing client + 402 typed error
- `apps/web/src/components/Sidebar.tsx` and `MobileTabBar.tsx` — billing nav entry (keep in sync)
- `apps/web/messages/es.json` and `en.json` — billing translation keys
- `render.yaml` — new env vars (`sync: false` for the secrets)
