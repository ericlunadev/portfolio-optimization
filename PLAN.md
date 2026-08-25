# Whitelabel — Implementation Plan

Executable plan for the B2B whitelabel feature. Every open question from `QUESTIONS.md` has been
resolved to its recommended answer; those decisions are locked in §2 and should not be relitigated.
Where a decision genuinely could not be made without running code, it appears in §9 as an escalation
with a defined fallback.

**Audience:** an engineer or agent picking this up cold. Read §1–§3, then work the phases in order.

**Companion docs:** `QUESTIONS.md` (why each decision was made), `CLAUDE.md` (project rules that
override anything here), `PAYMENTS.md` (the billing model this modifies).

---

## 1. What you are building

A single deployment of the app that serves multiple client organisations, each on its own hostname,
each seeing its own brand, each with its own users, data, and credit wallet.

**The shape of the product** is B2B internal tooling: an advisory or asset-management firm gives the
app to its own analysts, branded as their product, so it holds up in a client meeting and in the PDF
that leaves the room. It is *not* a retail product their customers sign up for — that is a later
migration, and the schema below is deliberately shaped so it stays possible.

**The honest state of the codebase:** the colour system is disciplined and re-skinning is cheap. The
tenancy layer does not exist at all — the strings `organization` and `tenant` appear nowhere in
`apps/api/src` or `apps/web/src`. So the visible half of this feature is roughly a week and the
invisible half is most of the project. Phase 0 ships nothing a user can see and is the phase most
likely to get cut under schedule pressure. Do not cut it.

---

## 2. Locked decisions

| # | Decision | Consequence |
| --- | --- | --- |
| D1 | **Shared deployment**, tenant resolved from hostname | One Vercel + one Render + one Turso. `funds`/`prices` stay global and shared — the main reason not to isolate. |
| D2 | **`organization_id` columns**, one database | Not per-tenant Turso DBs: `db/index.ts` builds one client at module scope, and per-tenant DBs would break the shared price cache. |
| D3 | **One user belongs to exactly one org** | Unique constraint. No org switcher, no active-org session state. |
| D4 | **Personal-org backfill**; `organization_id` is `NOT NULL` | Exactly one code path. No `OR organization_id IS NULL` anywhere, ever. |
| D5 | **The D2C product becomes tenant #1** | Dogfooding is the only reliable way to keep tenancy working. |
| D6 | **Subdomains of ours only** (`acme.optim.app`) | No custom-domain DNS/TLS verification in v1. |
| D7 | **Org-level wallet**, per-user attribution in the ledger | `wallet_balance` PK moves to `organization_id`; `credit_ledger.user_id` stays. Deliberately reverses a `PAYMENTS.md` non-goal. |
| D8 | **Tenant end users never transact** | The org pre-purchases credits. Sidesteps merchant-of-record, Stripe Connect, per-tenant tax. |
| D9 | **Accent colour only** — tenants do not get the full palette | Prevents unreadable apps and unwinnable contrast-ratio support tickets. |
| D10 | **Semantic colours are never tenant-configurable** | Gain stays green, loss stays red, per `CLAUDE.md`. |
| D11 | **Fixed menu of ~6 fonts**, no upload | `next/font/google` needs statically-analysable literals; runtime fonts are impossible without self-hosting. |
| D12 | **Mobile app is out of scope** | Whitelabel mobile is a bigger project than whitelabel web. Tenants get the responsive web app. |
| D13 | **Provisioning is an internal CLI**; branding is self-serve | At 1–5 tenants a provisioning UI is waste; a branding settings page is the highest value-per-effort item here. |
| D14 | **Two commercial tiers**: co-branded and full whitelabel | Only difference in code: whether "Powered by" renders in the footer and PDF. |
| D15 | **Out of v1:** SSO, custom domains, per-seat credit limits, data residency, tenant-uploaded instruments | Named in §8 so they are not surprises in a sales call. |

---

## 3. Architecture

### 3.1 Tenant resolution

```
Request to acme.optim.app
   │
   ▼
apps/web/src/middleware.ts          ← NEW FILE (none exists today)
   │  read Host header → look up org → attach x-org-id / x-org-slug request headers
   ▼
Root layout (server component)
   │  fetch tenant config → inject <style> overriding :root tokens → render brand
   ▼
Page
```

Requests to the API carry the session cookie. **The API resolves the org from the authenticated
user's membership row, never from a client-supplied header** — a header would be trivially forgeable.
The middleware headers exist only so the *web* layer can brand pages that have no session yet (auth
screens, marketing surfaces).

### 3.2 The cookie question, resolved

`QUESTIONS.md` §3.3 worried about `SameSite=None` across N tenant hostnames. Reading
`apps/web/next.config.js` resolves this better than the question assumed: it already rewrites
`/api/:path*` to the API service. **Route all tenant traffic through that rewrite** and the browser
only ever talks to the tenant hostname, so session cookies are **first-party per tenant host** — no
`SameSite=None`, no third-party-cookie exposure, and per-host cookie isolation becomes a security
*benefit* rather than a risk.

Concretely: whitelabel tenants must **not** set `NEXT_PUBLIC_API_URL`, which flips
`apps/web/src/lib/api.ts` into external / `credentials: "include"` mode. Keep them on the rewrite
path.

`auth.ts` still needs `trustedOrigins` to include every tenant hostname — today it is a static array
literal at `apps/api/src/lib/auth.ts:77`.

### 3.3 Branding pipeline

One function is the source of truth for tenant colour, consumed by **three** independent palettes
that share nothing today:

```
organization_branding.accent_hex
   │
   ▼
deriveTenantPalette(accentHex)  ← NEW: apps/web/src/lib/tenant-palette.ts
   │
   ├─→ CSS custom properties   → inline <style> in root layout (overrides :root and .dark)
   ├─→ ChartColors hex set     → apps/web/src/components/charts/chart-theme.tsx
   └─→ PDF colour constants    → apps/web/src/lib/simulation-pdf.ts:22-29
```

The PDF is the one most likely to be forgotten: it declares its own 8 hex constants, dark-only,
sharing nothing with `globals.css`. It is also the artifact that leaves the building, so it is v1.

---

## 4. Phase 0 — Tenancy foundation (no user-visible change)

**Goal:** every scoped row belongs to an organisation, every scoped query filters by it, and a test
proves org A cannot reach org B's data. Ships dark.

### Task 0.1 — Spike: BetterAuth organization plugin *(half a day, do this first)*

BetterAuth ships an official `organization` plugin providing orgs, members, roles, and invitations.
Adopting it saves writing all of that; the cost is that it owns its table shapes inside `schema.ts`.

- Read the plugin docs for the pinned BetterAuth version (check `apps/api/package.json`).
- Verify it works with the `drizzleAdapter` + libSQL/Turso combination in
  `apps/api/src/lib/auth.ts`, and that it composes with the existing `expo()` plugin.
- Generate a migration against a scratch DB and inspect the tables it wants.

**Decision gate.** Adopt it if it works cleanly with Turso and does not fight the Expo plugin.
Otherwise hand-roll the two tables in Task 0.2. **Record which path you took at the top of this file
before continuing** — everything downstream depends on it.

If adopting: you still need `organization_branding`, `organization_domain`, and
`organization_settings` as your own tables, and you must still enforce D3 (one user, one org)
yourself — the plugin permits many.

### Task 0.2 — Schema

Edit `apps/api/src/db/schema.ts`. Follow the `CLAUDE.md` migration workflow exactly:
`pnpm db:generate` from `apps/api/`, commit the generated file in `drizzle/`, let Render run
`db:migrate` on deploy. **Never `db:push`.**

New tables (skip `organization` / `organization_member` if the plugin provides them):

```ts
export const organization = sqliteTable("organization", {
  id: text("id").primaryKey(),                          // UUID
  slug: text("slug").notNull().unique(),                // "acme" → acme.optim.app
  name: text("name").notNull(),                         // legal / display name
  tier: text("tier").notNull().default("cobranded"),    // 'cobranded' | 'whitelabel'  (D14)
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
});

export const organizationMember = sqliteTable(
  "organization_member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),     // 'owner' | 'member'
    createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
  },
  // D3: one user, one org. This constraint is the enforcement.
  (t) => [
    unique("org_member_user_unique").on(t.userId),
    index("org_member_org_idx").on(t.organizationId),
  ]
);

export const organizationBranding = sqliteTable("organization_branding", {
  organizationId: text("organization_id").primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  productName: text("product_name"),                    // replaces Brand.fullName
  productShortName: text("product_short_name"),         // replaces Brand.shortName
  tagline: text("tagline"),
  accentHex: text("accent_hex"),                        // the ONLY colour input (D9)
  fontKey: text("font_key").default("instrument-sans"), // one of the ~6 allowed (D11)
  logoUrl: text("logo_url"),
  faviconUrl: text("favicon_url"),
  supportEmail: text("support_email").notNull(),        // required at provisioning
  privacyPolicyUrl: text("privacy_policy_url").notNull(),
  termsUrl: text("terms_url").notNull(),
  disclaimerText: text("disclaimer_text"),              // wording editable, presence is not (§7.5)
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
});

export const organizationDomain = sqliteTable(
  "organization_domain",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    hostname: text("hostname").notNull().unique(),      // "acme.optim.app"
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(true),
  },
  (t) => [index("org_domain_host_idx").on(t.hostname)]
);

// Per-tenant product toggles (QUESTIONS §7). One row per org.
export const organizationSettings = sqliteTable("organization_settings", {
  organizationId: text("organization_id").primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  academiaEnabled: integer("academia_enabled", { mode: "boolean" }).notNull().default(true),
  advisorMode: text("advisor_mode").notNull().default("off"),  // 'off' | 'platform' | 'tenant'
  advisorBookingUrl: text("advisor_booking_url"),
  advisorCostCredits: integer("advisor_cost_credits").default(100),
  cryptoRailEnabled: integer("crypto_rail_enabled", { mode: "boolean" }).notNull().default(false),
  fundAllowlist: text("fund_allowlist"),                // JSON array of tickers; NULL/empty = unrestricted
  overdraftLimit: integer("overdraft_limit").notNull().default(0),
});
```

Add `organizationId` (text, `NOT NULL`, FK, indexed) to: `simulations`, `user_profile`,
`user_assumptions`, `user_correlations`, `background_tasks`, `credit_ledger`, `payments`.

Change `wallet_balance`: primary key becomes `organizationId`; drop `userId` (D7).

**Do NOT add `organizationId` to:** `funds`, `prices`, `index_data`, `fund_exposures`, `key_figures`,
`credit_packages`. These stay global — that is the whole reason D1 chose a shared deployment.

Also add to `simulations`: `sharedWithOrg` boolean, default `false` (see Task 3.4).

### Task 0.3 — Backfill migration

Hand-write a data migration (a `.sql` file alongside the generated one, or a one-shot script run
before the `NOT NULL` constraint lands). SQLite cannot add a `NOT NULL` column without a default to a
populated table, so sequence it:

1. Add `organization_id` as **nullable** everywhere.
2. For each existing user: create an `organization` (slug derived from the email local-part, deduped
   with a numeric suffix), an `organization_member` row with `role = 'owner'`, an
   `organization_settings` row, and an `organization_branding` row carrying today's defaults.
3. Backfill `organization_id` on every scoped row from its owning user.
4. Migrate `wallet_balance`: create the new org-keyed table, copy each user's balance to their
   personal org, drop the old table.
5. Add the `NOT NULL` constraints (SQLite does this via table rebuild — Drizzle generates it).

**Verify before and after:** `assertWalletLedgerInvariant()` in
`apps/api/src/lib/billing/reconcile.ts` must return zero drift rows both times. Note that its SQL
joins on `user_id` and must be rewritten to group by `organization_id` as part of Task 0.5 — do that
rewrite first so the check is meaningful on the post-migration side.

Test the whole migration against a **copy of production data**, not an empty dev DB. The `backups/`
directory at the repo root is the obvious source.

### Task 0.4 — Org context in the API

In `apps/api/src/middleware/auth.ts`: after resolving the session user, look up their
`organization_member` row and `c.set("organizationId", ...)`. Extend the `ContextVariableMap`
declaration alongside the existing `user` / `optionalUser` entries.

A user with no membership is a bug after the backfill — throw 500 with a loud log. Do not silently
create one; that would paper over exactly the failure this phase exists to prevent.

### Task 0.5 — Scope every query

The surface is small and fully enumerated below. Add `organizationId` to the `where` of each:

| File | Sites | Notes |
| --- | --- | --- |
| `apps/api/src/modules/simulations/routes.ts` | lines 22, 51, 131, 165, 173, 192 | Line 94 (`where: eq(simulations.id, id)`) looks unfiltered but is **not** a bug — it re-reads the row just inserted in the same POST handler, keyed by a server-generated UUID. Leave it alone; it needs `organizationId` on the *insert*, not the read. |
| `apps/api/src/modules/onboarding/routes.ts` | lines 49, 55, 96, 104, 107, 153, 174, 185 | Profile is per-user; add org as a second filter. |
| `apps/api/src/modules/billing/routes.ts` | lines 269, 458–459 | Wallet reads move to the org key entirely in Phase 2. |
| `apps/api/src/lib/billing/spend.ts` | lines 56, 108, plus the two raw `UPDATE wallet_balance … WHERE user_id` statements | Phase 2 rewrites these wholesale; scope them here only if Phase 2 is not immediately following. |
| `apps/api/src/lib/billing/reconcile.ts` | the whole query | Rewrite both halves of the `UNION ALL` to group by `organization_id`. |
| `apps/api/src/modules/tasks/routes.ts` | 1 site | — |

For the `simulations` list and read endpoints, honour `sharedWithOrg`: a user sees their own rows
**or** rows in their org flagged shared.

### Task 0.6 — Isolation tests *(mandatory, not optional)*

`vitest` is already configured in `apps/api` (`pnpm test`). Create
`apps/api/src/modules/__tests__/tenant-isolation.test.ts`:

- Seed two orgs, each with one user, one simulation, one profile, and a funded wallet.
- For **every** scoped endpoint, assert org A's session cannot read, update, delete, or enumerate
  org B's rows — and that the response is **404, not 403**, so row existence is not leaked.
- Assert `spendCredit` called for a user in org A never moves org B's balance.

**Repo convention to adopt, and to add to `CLAUDE.md`:** a new org-scoped table lands with its
isolation test in the same commit. A single missing `WHERE organization_id = ?` leaks one client's
portfolio to a competitor, and nothing except a test reliably prevents that class of bug.

### Task 0.7 — Tenant-tagged logging

Add `organizationId` to the Hono logger context and to every `console.error` in the API. Cheap now,
impossible to retrofit at 2am when a tenant says "it's slow".

### Phase 0 definition of done

- `pnpm test` and `pnpm typecheck` pass in `apps/api`.
- Migration applies cleanly to a production-data copy; the wallet/ledger invariant holds before and
  after.
- The isolation test covers every scoped endpoint, and fails if any `where` clause is removed
  (verify by actually removing one).
- **Zero user-visible change.** The app looks and behaves exactly as before.

---

## 5. Phase 1 — Branding

**Goal:** a tenant on their own hostname sees their name, logo, accent colour, and font — with no
flash of our brand — across the app, auth screens, emails, and the PDF export.

### Task 1.1 — Host-based tenant resolution

Create `apps/web/src/middleware.ts` (does not exist today):

- Read the `Host` header, look up `organization_domain`, attach `x-org-id` and `x-org-slug` to the
  request headers.
- Unknown host → serve the default (D2C) tenant rather than a 404. A misconfigured DNS record should
  degrade to our brand, not to an error page.
- Exclude static assets and `/api/*` from the matcher.

The middleware cannot query Turso directly on the Edge runtime. Either run it on the Node runtime, or
resolve via a cached API call. **Prefer an in-memory map with a short TTL, refreshed from the API** —
at 1–15 tenants the whole table fits comfortably in memory and this avoids a per-request DB round
trip on the hot path.

### Task 1.2 — `deriveTenantPalette`

Create `apps/web/src/lib/tenant-palette.ts` exporting a pure function from one accent hex to the
complete derived set, plus unit tests (`vitest` is already set up in `apps/web`).

It must produce, for **both** light and dark:

- `--primary`, `--primary-emphasis`, `--ring`, `--gradient-gold-from`, `--gradient-gold-to`,
  `--glow-strong`, `--glow-soft` — the accent is load-bearing across all seven.
- The `ChartColors` hex set for `chart-theme.tsx`.
- The PDF colour constants for `simulation-pdf.ts`.

Three rules that are not negotiable:

1. **Contrast.** Compute contrast against `--background` in both themes and auto-adjust lightness to
   reach 4.5:1 — do not reject the tenant's colour. Mirror the trick `--primary-emphasis` already
   uses: move *away* from the page in each theme (darker on light, brighter on dark).
2. **Semantic collision (D10).** `optimal` is the accent, but `danger` stays red and gain/loss stay
   green/red. If the tenant's accent falls in the red hue range, nudge it out for chart series use
   only — otherwise a tenant with a red brand gets a chart where "your portfolio" reads as "you lost
   money".
3. **Hex output for charts.** `chart-theme.tsx:44` documents that call sites build alpha by string
   concatenation (`${color}55`, and `${colors.danger}1f` in `DrawdownChart.tsx:94`). Keep emitting
   real hex strings; do not convert charts to CSS variables.

### Task 1.3 — Inject branding without a flash

In `apps/web/src/app/layout.tsx`:

- Read the org from the middleware headers, fetch its branding server-side.
- Emit an inline `<style>` in `<head>` overriding the accent tokens on `:root` and `.dark`.
- Set `<title>` and favicon from tenant config via `generateMetadata()`.

This mirrors what `THEME_INIT_SCRIPT` already does for dark mode: decide server-side, correct before
first paint, never fetch branding client-side. Server-rendered CSS means there is no flash to
correct — no init script needed for colour.

### Task 1.4 — Hoist `Brand` and `Metadata` out of the message files

This is the most invasive branding change and it is unavoidable. `Brand.shortName` /
`Brand.fullName` / `Brand.tagline` and the `Metadata` namespace currently live in
`apps/web/messages/{es,en}.json`, which are static JSON compiled into the bundle — so they cannot
vary per tenant.

- Remove those namespaces from the message files.
- Provide them as a runtime tenant-config object from the root layout, threaded through a new
  `TenantProvider` (client context) alongside the existing `NextIntlClientProvider`.
- Update consumers: `Header.tsx:44-45`, `Sidebar.tsx:25-26`, and anything else calling
  `useTranslations("Brand")`.

**Interaction with the `CLAUDE.md` i18n rule.** "Never hardcode UI strings" still holds for every
other string. Brand values are *tenant data*, not UI copy — they are not translated, and they come
from the database. Add a sentence to `CLAUDE.md` making that distinction explicit so the next person
does not "fix" it back into the message files.

The tenant's *locale-independent* fields (product name, logo) are single values. The tagline may need
per-locale variants; keep it single-valued in v1 and note the limitation.

### Task 1.5 — Logo, favicon, fonts

- **Storage:** there is no blob storage in the stack (no S3/R2/Cloudinary dependency anywhere). For
  the first 1–3 tenants, **commit the assets to the repo** under `apps/web/public/tenants/<slug>/`
  and store the path in `logo_url`. That is genuinely viable and saves standing up infrastructure for
  a feature with three users. Move to Vercel Blob when self-serve upload lands (Task 1.7 can ship
  without it).
- **Fonts:** import ~6 Google fonts in `layout.tsx` (they must stay static literals — that is the
  `next/font/google` constraint behind D11), expose each as a CSS variable, and switch via a class
  driven by `font_key`.

### Task 1.6 — Brand the surfaces

In priority order, all v1:

| Surface | Files |
| --- | --- |
| Sidebar / header wordmark | `components/layout/Sidebar.tsx`, `Header.tsx` |
| Tab title + favicon | `app/layout.tsx` |
| **PDF export** | `lib/simulation-pdf.ts` — replace the 8 constants at lines 22–29 with derived values; thread branding through `SimulationPdfInput` |
| Auth screens | `components/auth/`, `app/auth/` |
| Onboarding | `components/onboarding/` |
| Transactional email | `apps/api/src/lib/email/templates/{VerifyEmail,ResetPassword}.tsx` |

**Do not tint the 3D globe** (`components/academia/ZoomGlobe.tsx`). It is a cinematic scene framed by
the `--scene-*` tokens, per `CLAUDE.md`; tinting a rendered scene by an arbitrary brand colour looks
broken more often than not.

**Powered-by (D14):** render the "Powered by" line in the footer and PDF only when
`organization.tier = 'cobranded'`.

**Open sub-question worth raising with the client:** the PDF is dark-background by design. That is a
deliberate choice for our brand, but it costs a tenant real toner when their client prints it, and it
reads as "someone else's template" more than any other surface. Consider a light/paper PDF variant —
it is a genuine product decision, not a technical one.

### Task 1.7 — Branding settings page

A page under `app/(app)/settings/branding`, visible to `role = 'owner'` only: product name, accent
(colour picker with a live contrast warning), font, logo, support email, privacy/terms URLs,
disclaimer text.

This is the single highest ratio of perceived value to build cost in the whole project — roughly one
page and one endpoint. It is the difference between shipping a product and shipping a consulting
deliverable.

### Task 1.8 — Caching *(the most likely way this feature causes an incident)*

The app is host-agnostic today and becomes host-sensitive overnight. Next.js caches aggressively. A
cache leak here serves Acme's branding — or worse, Acme's data — to Beta Corp.

- Audit every `fetch` and route segment config for cacheability.
- Add `Vary: Host` on tenant-scoped responses.
- Include the org ID in every cache key.
- Set `export const dynamic = "force-dynamic"` on tenant-scoped routes unless a specific route has
  been reasoned about explicitly.
- **Write an explicit cross-tenant cache-bleed test**: request as tenant A, then as tenant B, assert
  no A-specific value appears in B's response.

### Phase 1 definition of done

- Two test tenants on two hostnames render two distinct brands with no flash of the other.
- The PDF export carries tenant branding in all three colour systems.
- Cache-bleed test passes.
- `pnpm build` succeeds; light and dark both pass a contrast check with a deliberately awkward accent
  (pale yellow is the good adversarial case).

---

## 6. Phase 2 — Org billing

**Goal:** the organisation holds the wallet; the ledger still attributes every credit to the user who
spent it.

### Task 2.1 — Wallet moves to the org

Rewrite `apps/api/src/lib/billing/spend.ts`:

- `ensureWalletRow(organizationId)`.
- Both raw SQL statements change `WHERE user_id = ${userId}` → `WHERE organization_id = ${orgId}`.
- `spendCredit` / `grantCredits` take `{ organizationId, userId, … }` — org for the balance, user for
  the ledger row.
- `reverseSpend` reads both from the original ledger row.

Update `meterRequest` in `apps/api/src/lib/billing/metering.ts` to pass both.

**Preserve the existing idempotency semantics exactly.** The current implementation is careful:
idempotency-key replay, a conditional `UPDATE … WHERE credits >= cost` for atomicity, and a
race-loser recovery path in the `catch`. Do not simplify any of that while moving the key.

### Task 2.2 — Overdraft

Change the conditional update to `credits - cost >= -overdraft_limit`, reading the limit from
`organization_settings`. Default 0 preserves today's behaviour exactly.

Rationale: never hard-block a paying enterprise tenant in front of their own client. An analyst
hitting a 402 mid-meeting is the worst possible failure mode.

### Task 2.3 — Admin credit grant

An admin-only endpoint writing a `reason: 'grant'` ledger row against an org. This is how invoiced
customers (net-30 POs, not cards) get their credits. The ledger already supports `grant`; no
invoicing system, no automation, one endpoint.

### Task 2.4 — Usage view

One page for the org owner: credits by user, simulations run, recent activity — mostly
`credit_ledger` grouped by `user_id`. This is the main thing an owner logs in for, and it is what
justifies the platform fee.

### Task 2.5 — Low-balance email

At 20% of the last top-up, email the owner. Reuse the `apps/api/src/lib/email/` machinery; brand it
per Task 1.6.

### Task 2.6 — Hide the crypto rail

Gate the Coinbase rail behind `organization_settings.crypto_rail_enabled` (default false). A
corporate finance department pays by card or invoice.

### Phase 2 definition of done

- Wallet/ledger invariant holds at the org level; `reconcile.ts` reports zero drift.
- Idempotency tests still pass — including the concurrent-same-key race.
- Two users in one org share a balance; a user in another org is unaffected.

---

## 7. Phase 3 — Tenant product controls

### Task 3.1 — Fund allowlist

Filter the `/search` handler in `apps/api/src/modules/historical/routes.ts` (the live Yahoo call at
line 33 is currently unrestricted — any EQUITY/ETF worldwide) through
`organization_settings.fund_allowlist` when non-empty. Empty preserves today's behaviour.

Value: partly UX, partly compliance — recommending an instrument the tenant cannot execute is a real
problem for them.

### Task 3.2 — Academia toggle

Gate the `/academia` route and its nav entries on `academia_enabled`. Remember `CLAUDE.md`'s rule
that `Sidebar.tsx` and `MobileTabBar.tsx` nav items stay in sync. Many B2B tenants will want it off —
their analysts do not need a Markowitz tutorial — and "off" is free to build.

### Task 3.3 — Advisor CTA *(handle before the first tenant demo)*

Today the CTA books a call with "**nuestro** asesor financiero" via our Cal.com, for 100 credits.
On a tenant's branded app this routes *their* clients to *our* advisor — channel conflict, and in
most jurisdictions a licensing problem.

Implement the three modes from `organization_settings.advisor_mode`:

- `off` — **the default for every whitelabel tenant.** Hide the CTA entirely.
- `platform` — our advisor (D2C behaviour today).
- `tenant` — the tenant's own booking URL and credit cost.

Move `ADVISOR_BOOKING_URL` and `ADVISOR_CALL_COST_CREDITS` out of
`apps/api/src/config/env.ts` onto the org row. Update the `AdvisorCta` copy so the possessive
("nuestro") is not baked into a string that a tenant will inherit.

### Task 3.4 — Org-shared simulations

Surface the `sharedWithOrg` flag added in Task 0.2: a toggle on the simulation, and an "shared with
my organisation" filter in the list. Private stays the default. This pre-empts the first feature
request every B2B customer will make.

### Task 3.5 — Mandatory disclaimer

Render `organization_branding.disclaimer_text` in the app and in the PDF export. The **wording** is
tenant-editable; the **presence** is not — falling back to our default text if the field is empty.

The app outputs portfolio allocations. Under a tenant's brand, their client sees their logo on a
recommendation our optimizer produced. See §9.3 — this needs a lawyer's review, not just an
implementation.

### Task 3.6 — Data export

An org-scoped JSON dump endpoint, admin-triggered. Roughly half a day. Not having an answer during a
contract review costs more than building it.

---

## 8. Explicitly out of scope

State these in sales conversations rather than discovering them mid-contract:

- **SSO (SAML/OIDC)** — any buyer above ~50 seats will ask. This is the known enterprise gate.
- **Custom domains** — subdomains only (D6). Surprising support burden for something that looks like
  a checkbox.
- **Per-tenant OAuth apps** — with shared credentials, the Google consent screen shows *our* app name,
  which breaks the illusion at the highest-stakes moment. See §9.2 for the v1 workaround.
- **Per-seat credit limits** — needs period accounting the append-only ledger does not model.
- **Data residency** — an EU tenant requiring EU-hosted data needs the isolated-deployment path.
- **Tenant-uploaded instruments** — a fund manager wanting *their* funds in the optimizer, not just
  SPY, may be the actual killer feature. It needs per-tenant rows in the currently-global
  `funds`/`prices` tables plus a price-upload path. **Scope it as its own project**, not a Phase 3
  bullet.
- **Mobile whitelabel** (D12). A tenant's user signing into the shared Expo app gets correct data
  isolation and their org's wallet, unbranded.
- **Scheduled-simulation timing** — `CRON.md`'s design works per-tenant as-is (the daily tick fans
  out per org), but Vercel Hobby's one-cron-per-day limit means "Monday 8am *their* time" across
  timezones is not deliverable. The fix is a Vercel Pro plan, not code.

---

## 9. Escalate — do not decide these alone

**9.1 — How many tenants in 12 months?** At three, per-tenant deploys plus a config file would have
been the right architecture and much of this plan is over-engineering. At fifteen, all of it is
necessary. This plan assumes **4–15**. If the real answer is 1–3, say so before starting Phase 0 —
it changes the shape of the work substantially.

**9.2 — OAuth consent screen.** Per-tenant OAuth credentials (encrypted on the org row) are the
correct fix, but `apps/api/src/lib/auth.ts:51` builds `socialProviders` once at module scope from
env, so this is a real refactor to per-tenant provider config. **The v1 workaround is
email+password only for whitelabel tenants**, which is acceptable for B2B internal use and saves
significant work. Confirm that trade-off with the client rather than assuming it.

**9.3 — Liability for the advice.** The highest non-technical risk in this project. Who is liable
when a tenant's client acts on an allocation our optimizer produced under the tenant's logo? Task 3.5
implements a mandatory disclaimer, but the wording and the back-to-back contract clause want a
lawyer's 30 minutes before the first tenant goes live. `sow.md`'s "not a trading tool" framing is the
right starting position.

**9.4 — Reversing a `PAYMENTS.md` non-goal.** D7 contradicts a documented decision ("multi-tenant /
org wallets" listed as out of scope). Update `PAYMENTS.md` in the same PR as Phase 2 so the two docs
do not disagree in the repo.

---

## 10. Working agreements

- **Migrations:** `CLAUDE.md` workflow, always. `pnpm db:generate` → commit the file → Render runs
  `db:migrate`. Never `db:push` in CI.
- **i18n:** every new user-facing string goes in both `es.json` and `en.json`. Brand values are the
  documented exception (Task 1.4).
- **Colour:** never hardcode. Tenant colours arrive as tokens or as `deriveTenantPalette` output —
  the three-palette rule in §3.3 is the only sanctioned path.
- **Dates:** DD/MM/YYYY in charts.
- **One phase per PR.** Phase 0 and Phase 1 stay separate: a schema migration and a visual overhaul
  failing together is much harder to debug than either failing alone.
- **Every org-scoped table lands with its isolation test in the same commit.**

---

## 11. Suggested sequencing

| Phase | Rough size | Ships to users |
| --- | --- | --- |
| 0 — Tenancy foundation | Largest single chunk; the schema and backfill dominate | Nothing visible |
| 1 — Branding | Roughly a week of the visible work | The demoable feature |
| 2 — Org billing | Smaller; mostly a careful rewrite of `spend.ts` | Owner-facing |
| 3 — Product controls | Several small independent tasks | Per-tenant configuration |

Phases 2 and 3 are largely independent of each other and can be reordered to suit a customer
conversation. **Phase 0 must come first, and Phase 1 must not start before it lands** — branding
built on unscoped data would need reworking the moment orgs arrive.
