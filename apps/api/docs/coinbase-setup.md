# Coinbase Commerce — Setup Guide

How to wire a Coinbase Commerce account into this app so that `charge:confirmed`
webhooks credit users on the ledger. Pairs with the implementation in
`apps/api/src/modules/billing/coinbase.ts` and `routes.ts`.

For the broader payments design (ledger invariants, refund policy, etc.) see
`PAYMENTS.md` at the repo root.

---

## 1. Create the Coinbase Commerce account

1. Sign up at [commerce.coinbase.com](https://commerce.coinbase.com). This is a
   separate product from the regular Coinbase exchange account.
2. Confirm your email and enable 2FA. Charges cannot be created until 2FA is on.
3. Coinbase Commerce runs on a **self-custody** model: you'll set a recovery
   phrase that controls where settled funds end up. Back it up before
   continuing — there is no account-recovery flow if it's lost.

## 2. Create the API key

The API key is used by our server to mint charges.

1. Dashboard → **Settings** → **Security** → **API keys**.
2. Click **Create an API key**. Copy it once — it is not shown again.
3. Set the env var:

   ```
   COINBASE_COMMERCE_API_KEY=<paste here>
   ```

   - Local: `apps/api/.env`
   - Render: project → Environment → add `COINBASE_COMMERCE_API_KEY`
     (`render.yaml` already declares the slot with `sync: false`).

## 3. Register the webhook endpoint

This is what actually grants credits. The API key alone only creates charges —
without a working webhook, nothing lands in the wallet.

1. Dashboard → **Settings** → **Notifications** (also labelled
   **Webhook subscriptions** in some UI revisions).
2. Click **Add an endpoint** with URL:
   - Production: `https://<api-host>/api/billing/webhooks/coinbase`
   - Local dev: tunnel via ngrok / cloudflared and use the tunnel URL.
     Coinbase will not reach `localhost`.
3. Subscribe to **at minimum** these events:

   | Event              | Why                                                        |
   | ------------------ | ---------------------------------------------------------- |
   | `charge:confirmed` | Triggers the credit grant on the ledger                    |
   | `charge:resolved`  | Safety net after re-org window (idempotent no-op)          |
   | `charge:failed`    | Marks `payments.status = 'failed'`                         |
   | `charge:delayed`   | Underpayment / late payment → `payments.status = 'expired'` |

   Other event types are logged and ignored — fine to leave subscribed.
4. Save. Coinbase will display a **Shared Secret** for the endpoint. Copy it.
5. Set the env var:

   ```
   COINBASE_COMMERCE_WEBHOOK_SECRET=<paste here>
   ```

   - This is **different** from the API key.
   - Each endpoint has its own secret. Production and staging endpoints
     therefore have different secrets.

## 4. Seed the crypto packages

From `apps/api/`:

```bash
pnpm tsx src/scripts/seed-billing-packages.ts
```

Inserts the three crypto rows (`pack_starter_crypto`, `pack_pro_crypto`,
`pack_power_crypto`) into `credit_packages`. The script is idempotent — safe to
re-run after a deploy. Coinbase has no pre-created products on its end; charges
are minted per checkout, so these rows live only in our DB.

## 5. Local smoke test

1. Start the API: `pnpm dev` from `apps/api/`.
2. Start a tunnel (e.g. `ngrok http 8001`) and set the Coinbase webhook URL to
   the tunnel.
3. Start the web app and visit `/billing`. Switch to the **Cripto** tab — the
   three crypto packages should render.
4. Pick a pack → buy → you land on Coinbase's hosted checkout.
5. **Without paying real crypto:** in the Coinbase dashboard, next to the
   endpoint, click **Send test webhook**. It fires a synthetic event end-to-end
   (signature verification + handler path runs). Expect a warning log about
   "unknown package" since the test charge has no `payments` row — that's
   expected and confirms the signature path works.
6. **End-to-end with real money:** send a single-digit-cents USDC payment on a
   low-fee chain (Base or Polygon). The charge moves
   `created → pending → confirmed → resolved`; credits land at `confirmed`,
   typically <1 minute on Base.

## 6. Production cutover

1. Set `COINBASE_COMMERCE_API_KEY` and `COINBASE_COMMERCE_WEBHOOK_SECRET` in
   the Render environment.
2. In the Coinbase dashboard, register a webhook endpoint pointed at the
   production API host (or add it alongside the staging endpoint). Use the
   shared secret from the production endpoint for the production env var.
3. Trigger a Render deploy. The seed script only needs to run once per
   environment.

---

## Gotchas

- **Invalid signature in logs.** Almost always the wrong shared secret —
  usually the staging endpoint's secret pasted into prod env, or vice versa.
  Each endpoint in the dashboard has its own secret.
- **`charge:confirmed` vs `charge:resolved`.** We credit on `confirmed` (first
  confirmation). `resolved` is a re-org safety net and is a no-op because the
  ledger idempotency key would dedupe regardless. Don't move the credit grant
  to `resolved` without thinking through the user-facing latency hit.
- **Self-custody settlement.** Funds land in the wallet derived from your
  recovery phrase, not a custodial Coinbase balance. Plan a sweep/withdrawal
  flow before taking real volume.
- **No in-app refunds.** Per the PAYMENTS.md policy, there is no refund
  endpoint. If you ever issue a refund manually from the Coinbase dashboard,
  insert a `reason='reversal'` ledger row by hand to keep the
  `walletBalance.credits == SUM(creditLedger.delta)` invariant intact. There is
  no admin UI for this yet.
- **Webhook ordering.** The route is registered above `authMiddleware` in
  `routes.ts` so Coinbase can reach it without a session. Don't move it.

## Reference

- Implementation: `apps/api/src/modules/billing/coinbase.ts`
- Routes: `apps/api/src/modules/billing/routes.ts` (`/webhooks/coinbase`,
  `/crypto/checkout`)
- Seed script: `apps/api/src/scripts/seed-billing-packages.ts`
- Env: `apps/api/src/config/env.ts`
- Coinbase Commerce API docs: https://docs.cloud.coinbase.com/commerce/docs
