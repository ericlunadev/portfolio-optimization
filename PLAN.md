# Whitelabel — Implementation Plan (v2)

Executable plan for the B2B whitelabel feature.

**v2 supersedes v1.** Every claim below marked **[verified]** was established by *running* something —
`drizzle-kit generate` against this repo's real snapshot chain, migrations applied to a restored
production dump, the BetterAuth plugin instantiated, concurrent transactions measured against a real
libSQL database. v1 was written from reading alone and got several load-bearing things wrong; those
are called out inline as **[v1 was wrong]** so nobody re-derives the mistake.

**Audience:** an engineer or agent picking this up cold. Read §0–§3, then work the phases in order.

**Companion docs:** `QUESTIONS.md` (why each decision was made), `CLAUDE.md` (project rules that
override anything here), `PAYMENTS.md` (the billing model this modifies).

---

## 0. Read this first

### 0.1 Live bugs, unrelated to whitelabel, that Phase 0 must fix

These exist in production **today**. They are not caused by this project, but multi-tenancy makes some
of them dramatically worse, and two make Phase 0's acceptance test unachievable.

| # | Bug | Impact |
| --- | --- | --- |
| **B1** | **Unscoped idempotency replay.** `spend.ts:21-23` looks up `credit_ledger` by `idempotencyKey` alone — no user, no org predicate — and returns early at :40-41 before deducting. The key is a raw client header (`optimization/routes.ts:47,195,275,360`; `billing/routes.ts:490`), and two server-written formats are **guessable with no leak**: `signup-grant:${user.id}` (`onboarding/routes.ts:181`) and `purchase:${stripe session id}` (`billing/routes.ts:148`, where that session id is handed to the browser at :339). | Replaying either yields **unlimited free metered optimizations and free 100-credit advisor calls**. Billing-integrity bug. |
| **B2** | **`GET /api/tasks/:taskId` has no authentication at all** — `tasks/routes.ts:56`, no middleware, no owner filter, returns `result_data`. | Any unauthenticated caller reads any task result. |
| **B3** | **`DELETE /api/tasks/:taskId` is authenticated but not owner-scoped** — :88-89 and :100-103 filter on `id` only and never read `c.get("user")`. | Any user deletes any user's task. |
| **B4** | **The race-loser recovery commits an orphan decrement.** `return winner` inside the catch at `spend.ts:71-77` and `:123-127` returns *normally* from the transaction callback, so Drizzle commits and the wallet decrement at :47-50 survives with no ledger row behind it. Reproduced against a real libSQL database: the wallet fell to 9 with no matching ledger row. [verified] | Silent wallet/ledger drift under concurrency. Fixed in **Task 0.0**. |
| **B5** | **`Idempotency-Key` is not in the CORS allowlist.** `index.ts:29` is `allowHeaders: ["Content-Type", "Authorization"]` with `origin` pinned to a fixed string and `credentials: true`, while `apps/web/src/lib/api.ts:324` sends `Idempotency-Key` on `POST /api/billing/advisor-call`. The header was added two months after the cross-origin switch and the allowlist was never widened. | Live preflight failure on a paid endpoint. Two-line fix, independent of the §3.2 gate. |

**Explicitly refuted, so severity is not overstated** [verified]: B1 does **not** yield cross-tenant
credit *injection* (`spend.ts:146` guards `reason !== "spend" || delta >= 0`) and does **not** disclose
balances (`balanceAfter` never reaches a response body outside the user-scoped ledger endpoint).

### 0.2 What genuinely needs a human before Phase 0 can finish

Everything not flagged inline is decided. These are not:

1. **A fresh production dump.** Needs `DATABASE_URL` / `DATABASE_AUTH_TOKEN` from the Render dashboard
   (both are `sync: false`). See Task 0.3 — the migration cannot be rehearsed without it.
2. **Live production row counts**, especially `SELECT count(*) FROM simulations WHERE user_id IS NULL`.
   The only snapshot anyone has is from 2026-05-05 and predates every billing table.
3. **Three literal strings**: the support email, privacy-policy URL, and terms URL. None exist anywhere
   in the repo. Task 0.2 makes the columns nullable so this does not block the migration, but
   provisioning a real tenant needs them. *If no privacy policy or ToS exists at all, that escalates
   to §9.3.*
4. **Which org owns the D2C hostname** after the backfill, and what it is called.
5. **Whether a short 5xx window is acceptable on Deploy 3**, which drops `wallet_balance.user_id`
   while the previous release still runs raw `WHERE user_id = ?` (`spend.ts:46-50`, `:101-105`) — or
   whether to take the cheaper alternative in Migration (D) and skip Deploy 3 entirely. *(The NOT NULL
   flip is **not** the risky step; the three-deploy split already makes it safe.)* There is no
   `preDeployCommand` on the Render service today.
6. **The realistic tenant count** (§9.1). Still the question that decides whether this architecture is
   right at all.
7. **Wildcard DNS and a wildcard TLS certificate for `*.optim.app`, attached to the Vercel project.**
   D6 depends on it, nothing has verified it exists, and it has ops lead time — start it during
   Phase 0, not when Phase 1 needs it.

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
| D1 | **Shared deployment**, tenant resolved from hostname | One Vercel + one Render + one Turso. Rationale is **operational** — N isolated deploys means N deploys per release and N× the ops. **[v1 was wrong]** v1 justified this with "the shared price cache"; **nothing reads the `prices` table** [verified]. It is written by `yahoo-updater.ts:82-89` and read only by that file's own `max(date)` query at :35-42; the optimizer's `fetchTickerPrices` in `lib/yahoo.ts` contains no `db.` reference and hits Yahoo live. Keep the decision, not the reason. |
| D2 | **`organization_id` columns**, one database | Not per-tenant Turso DBs: `db/index.ts` builds one client at module scope, and per-tenant DBs would mean a client factory touching every import site. |
| D3 | **One user belongs to exactly one org** | Unique constraint on `organization_member.user_id`. No org switcher, no active-org session state. |
| D4 | **`organization_id` is `NOT NULL` on every scoped table — no exceptions** | The one candidate, `background_tasks`, is closed by D16 rather than excepted. **[v1 was wrong]** v1 asserted this without noticing that two tables have a nullable `user_id`, which is what made it unachievable as stated. |
| D5 | **The D2C product becomes tenant #1** | Dogfooding is the only reliable way to keep tenancy working. |
| D6 | **Subdomains of ours only** (`acme.optim.app`) | Assumes wildcard DNS + wildcard TLS on the Vercel project. **That is an ops prerequisite with real lead time and nothing has verified it exists.** |
| D7 | **Org-level wallet**, per-user attribution in the ledger | `wallet_balance` PK moves to `organization_id`; `credit_ledger.user_id` stays. Deliberately reverses a `PAYMENTS.md` non-goal — update that doc in the Phase 2 PR. |
| D8 | **Tenant end users never transact** | The org pre-purchases credits. Sidesteps merchant-of-record, Stripe Connect, per-tenant tax. |
| D9 | **Accent colour only** — tenants do not get the full palette | Prevents unreadable apps and unwinnable contrast-ratio support tickets. |
| D10 | **Semantic colours are never tenant-configurable** | Gain stays green, loss stays red, per `CLAUDE.md`. |
| D11 | **Fixed menu of ~6 fonts**, no upload | `next/font/google` needs statically-analysable literals. |
| D12 | **Mobile app is out of scope** — but not untouched | See §8: mobile users still hit Task 0.4's membership rule and D7's shared wallet. |
| D13 | **Provisioning is an internal CLI**; branding is self-serve | The CLI is also **the only way a second analyst gets an account** — no invite flow, no email. See Task 0.9. |
| D14 | **Two commercial tiers**: co-branded and full whitelabel | `organization.tier`. Only difference in code: whether "Powered by" renders in the footer and PDF. |
| D15 | **Out of the first release:** SSO, custom domains, per-seat credit limits, data residency, tenant-uploaded instruments | Named in §8 so they are not surprises in a sales call. |
| D16 | **`POST /api/tasks/yahoo-update` becomes authenticated** | That is what lets `background_tasks.organization_id` be `NOT NULL`, preserving D4 intact. The web hook `useYahooUpdate.ts` **has zero consumers** [verified], so nothing user-visible changes. It also gives Task 0.6 a session to test against. |

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

**Tenancy is keyed on `organization_domain.hostname`, not on `organization.slug`.** The slug is an
internal identifier only. Write this down because it is easy to assume otherwise.

**The API resolves the org from the authenticated user's membership row, per request** — never from a
client-supplied header (forgeable), and never cached on the session row. Caching tenancy on the
session is the stale-read hazard that BetterAuth's own `session.activeOrganizationId` exhibits. If the
per-request lookup ever shows up in a profile, cache in-process keyed by `userId` with a short TTL and
invalidate on membership write.

**Branding follows the host; data follows the membership row.** A signed-in user loading another org's
hostname sees that host's brand around their own org's data — cosmetic, permitted, and unavoidable
while the session cookie is shared across web hosts. **Do not redirect or 401 on the mismatch:** after
the personal-org backfill most users' org has no `organization_domain` row at all, so a mismatch check
would lock out every D2C user on day one — the exact opposite of Phase 0's "zero user-visible change".

### 3.2 Auth cookies — an open gate, not a solved problem

**[v1 was wrong, and this is the correction that matters most.]** v1 claimed that because
`next.config.js` rewrites `/api/:path*` to the API, routing tenant traffic through it makes session
cookies first-party per tenant hostname, removing the need for `SameSite=None`. It presented as a
discovery a configuration **this repo already tried and reverted**.

Commit **85f1740 (2026-03-20)**, "Switch frontend to direct API calls instead of Vercel rewrites",
says verbatim: *"Vercel blocks rewrites to Render due to DNS_HOSTNAME_RESOLVED_PRIVATE. Use
NEXT_PUBLIC_API_URL to call the backend directly with cross-origin credentials for cookie-based
auth."* That commit introduced the `isExternal` branch in `apps/web/src/lib/api.ts:1-11`, and the
`rewrites()` block at `next.config.js:8-16` defaults its destination to `http://localhost:8001` — it
survives as the **local-dev path**.

The cookie *mechanics* v1 described are sound in the abstract: a same-origin proxy really does make
the session cookie host-only. So this is salvageable — but as a **gate at the start of Phase 1**, not
as an assumption:

1. **Verify first.** `curl -si https://<prod-web-host>/api/health` (API JSON = rewrite live; Vercel
   error page = not) and `vercel env ls production`.
2. **Likely root cause** of the March failure is `API_URL` pointing at Render's *internal* hostname,
   which resolves to a private address — a one-line env fix.
3. **Fallback if the public host also fails:** an explicit catch-all proxy at
   `apps/web/src/app/api/[...path]/route.ts`. Not `rewrites()`.

Three riders that v1 missed entirely:

- **"Tenants must not set `NEXT_PUBLIC_API_URL`" is incoherent with D1.** `NEXT_PUBLIC_*` is inlined at
  build time into one shared bundle; with a single Vercel deployment the flip is global and
  all-or-nothing, never per-tenant.
- **`partitioned: true` must be deleted in the same edit** as the `sameSite` change. `auth.ts:84-96`
  sets all three attributes as one branch, and a `Partitioned` cookie paired with `SameSite=Lax` is
  incoherent and rejected by Chrome. v1 named only `SameSite=None`.
- **The security claim needs softening.** Per-host cookie isolation is defence-in-depth against a
  stolen cookie. Tenant data isolation comes entirely from `WHERE organization_id`.

Three consequences nobody had costed. **Both reworks below belong to Task 1.0, not Phase 0** — no
tenant hostname serves traffic until Phase 1, and this gate's outcome may change what they should be:

- **`trustedOrigins` must become a request-scoped function** (`auth.ts:77-83`) reading
  `organization_domain` with an in-process cache. A longer static array means provisioning a tenant
  requires an API env change plus a Render redeploy — directly contradicting D13. *(Task 1.0)*
- **CORS does not go away.** `index.ts:26` pins `origin: env.FRONTEND_URL` as a fixed string with
  `credentials: true`; it does not reflect the caller's Origin and emits no `Vary: Origin`. And
  `apps/mobile/src/lib/api/client.ts:32` keeps calling the API directly regardless of what the web
  does. Replace with an allowlist function. *(Task 1.0.* The `Idempotency-Key` half is **B5** and is
  fixed in Phase 0 — it is a live bug independent of this gate.*)*
- **Cutover invalidates every live session.** Moving the session cookie from the Render host to the
  web host logs out every existing user — including D2C, which D5 makes tenant #1 — and the recovery
  path is the password-reset email that Task 1.0 shows is itself tenant-blind. Sequence accordingly.

### 3.3 Branding pipeline

One function is the source of truth for tenant colour, consumed by **three** independent palettes that
share nothing today:

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

**The PDF renders client-side** — `simulation-pdf.ts:106` does `await import("jspdf")` [verified]. So
branding must be threaded through client props, not fetched server-side, and an image logo needs a
data URI or a same-origin fetch. Plan for that in Task 1.6 rather than discovering it.

---

## 4. Phase 0 — Tenancy foundation (no user-visible change)

**Goal:** every scoped row belongs to an organisation, every scoped query filters by it, and a test
proves org A cannot reach org B's data. Ships dark.

### Task 0.0 — Fix B4, and measure write contention *(before any schema change)*

*(Throughout this plan, `spend.ts`, `reconcile.ts` and `metering.ts` are under
`apps/api/src/lib/billing/` — not `modules/billing/`, which holds the routes.)*

**(a) Fix the orphan-commit race (B4).** Roll back explicitly: throw a sentinel out of the transaction
callback and resolve the winner *outside* it. Note `findExistingLedgerRow` reads via the module-level
`db`, not `tx`, so the recovery read cannot see the transaction. **This lands as its own PR against
the current per-user schema** — a concurrency fix and a key migration must not fail together, and
after Migration (D) the schema it targets no longer exists.

**(b) Measure write contention — it gates D7.** Overlapping `db.transaction()` calls against libSQL do
**not** serialise and wait; they fail. Measured against a real file DB: with 0ms overlap one succeeded
and the other returned `database is locked`; with 1ms or 25ms overlap the first got `cannot commit
transaction - SQL statements in progress` and the second `database is locked`. [verified] Cause:
`@libsql/client`'s `transaction()` takes the current connection, issues BEGIN, then nulls its handle so
the next caller opens a *second* connection — and no `busy_timeout` is configured (`config/env.ts:5`
defaults to a bare `file:portfolio.db` with no `?timeout=`).

Under D7, **N analysts sharing one wallet row means 500s before any drift appears.** And because the
four optimize routes `await reverseSpendOnError` inside their catch
(`optimization/routes.ts:169-172, 251, 336, 384`), a locked reversal **swallows the user's original
error and keeps the credit spent**.

**Measure against a real Turso database, not just locally** — production uses the remote hrana path.
This is in Phase 0 because a bad result invalidates D7, which is a Phase 0 schema decision.

**(c) Fix B5** — add `Idempotency-Key` to `allowHeaders` (`index.ts:29`). Two lines.

### Task 0.1 — BetterAuth organization plugin: **decision closed, HAND_ROLL**

**[v1 was wrong]** v1 made this a half-day spike defaulting to *adopt*. The spike was run. The plugin
**does** ship in the pinned 1.6.20, **does** compose with `expo()` (52 mounted paths, zero
duplicates), and **does** work with `drizzleAdapter({provider:"sqlite"})` [verified by instantiation].
It fails on none of the criteria v1 named. **Do not re-run the spike.** It is rejected on different
grounds:

- Mounting it exposes **21 public endpoints** under `/api/auth/organization/*`, including
  `/organization/leave`, which has **no disable option** and lets a member delete their own membership
  row — turning Task 0.4's rule into a permanent 500 for that user.
- Its `member` model is many-to-many by construction (`userId` is `index: true`, never unique; the
  only duplicate guard is per-org), so D3 needs a stack of suppressions.
- Putting D14's `tier` on its `organization` table as an `additionalField` lets a **tenant owner
  self-upgrade to full whitelabel and drop the "Powered by" footer** via `/organization/update`
  (exploit parse reproduced) unless `input: false` is set.
- `session.activeOrganizationId` caches tenancy in the session row — precisely the stale-read hazard
  §3.1 exists to prevent.

**Do not record the reason as "it saves no schema work."** That argument is false:
`npx @better-auth/cli generate` is the documented Drizzle path and would emit the tables.

**Keep the door open cheaply.** Shape the hand-rolled tables to match the plugin's models: reserve
nullable `logo` and `metadata` on `organization`, make both `createdAt` columns `.notNull()`, keep the
role vocabulary `'owner' | 'member'`. Adopting later is then `CREATE TABLE invitation` +
`ALTER TABLE session ADD active_organization_id` + a `schema.member.modelName: "organizationMember"`
remap — purely additive [remap verified].

*The one input that could flip this:* if seat creation ever becomes self-serve invite links with
email, expiry, and accept/reject, the plugin's invitation lifecycle is real saved work and ADOPT
deserves a second look. Under D13 it does not.

### Task 0.2 — Schema

This is the **target** schema. **Do not `db:generate` from it in one shot** — reaching it takes six
migration files across three deploys, and a single generate produces exactly the migration Task 0.3
shows libSQL rejects in production. **Read Task 0.3 first**; each intermediate `schema.ts` state is
committed alongside its own migration. The `CLAUDE.md` workflow still holds throughout
(`pnpm db:generate` from `apps/api/`, commit the generated file, Render runs `db:migrate`), and
**never `db:push`**.

```ts
export const organization = sqliteTable("organization", {
  id: text("id").primaryKey(),                           // UUID
  slug: text("slug").notNull().unique(),                 // internal id — NOT the subdomain
  name: text("name").notNull(),
  tier: text("tier").notNull().default("cobranded"),     // 'cobranded' | 'whitelabel'  (D14)
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),  // the D2C tenant;
                                                         // Task 1.1's "unknown host" fallback reads this
  logo: text("logo"),                                    // reserved for plugin parity (Task 0.1)
  metadata: text("metadata"),                            // reserved for plugin parity
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const organizationMember = sqliteTable(
  "organization_member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),      // 'owner' | 'member'
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  (t) => [
    unique("org_member_user_unique").on(t.userId),       // D3 enforcement
    index("org_member_org_idx").on(t.organizationId),
  ]
);

export const organizationBranding = sqliteTable("organization_branding", {
  organizationId: text("organization_id").primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  productName: text("product_name"),
  productShortName: text("product_short_name"),
  tagline: text("tagline"),
  accentHex: text("accent_hex"),                         // the ONLY colour input (D9)
  fontKey: text("font_key").default("instrument-sans"),
  logoUrl: text("logo_url"),
  faviconUrl: text("favicon_url"),
  // Nullable for the first release — see §0.2 item 3. No value for any of these exists in the repo, so
  // .notNull() would make the backfill SQL literally unwritable. Enforce at provisioning.
  supportEmail: text("support_email"),
  privacyPolicyUrl: text("privacy_policy_url"),
  termsUrl: text("terms_url"),
  disclaimerText: text("disclaimer_text"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
});

export const organizationDomain = sqliteTable(
  "organization_domain",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    hostname: text("hostname").notNull().unique(),
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(true),
  },
  (t) => [index("org_domain_host_idx").on(t.hostname)]
);

export const organizationSettings = sqliteTable("organization_settings", {
  organizationId: text("organization_id").primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  academiaEnabled: integer("academia_enabled", { mode: "boolean" }).notNull().default(true),
  advisorMode: text("advisor_mode").notNull().default("off"),   // 'off' | 'platform' | 'tenant'
  advisorBookingUrl: text("advisor_booking_url"),
  advisorCostCredits: integer("advisor_cost_credits").default(100),
  cryptoRailEnabled: integer("crypto_rail_enabled", { mode: "boolean" }).notNull().default(false),
  fundAllowlist: text("fund_allowlist"),                 // JSON array; NULL/empty = unrestricted
  overdraftLimit: integer("overdraft_limit").notNull().default(0),
  signupGrantCredits: integer("signup_grant_credits").notNull().default(3),  // see Task 2.5
});
```

Add `organizationId` — with `.references()`, an **explicit `onDelete`**, and an **`index()` on the new
column** — to: `simulations`, `user_profile`, `user_assumptions`, `user_correlations`,
`background_tasks`, `credit_ledger`, `payments`. Add `sharedWithOrg` (boolean, default false) to
`simulations`.

> **The index is not optional and not automatic.** Drizzle emits only indexes declared in `schema.ts`
> (every index in the file today is explicit — :70, :83, :259, :277…), and SQLite does not auto-index
> foreign-key columns. Omit it and all ~46 of Task 0.5's scoped queries filter an unindexed column on
> every request.

**Specify `onDelete` for every new FK — there is no house default to inherit.** The existing FKs are
deliberately heterogeneous: cascade on `user_profile` (:168), `wallet_balance` (:225), `credit_ledger`
(:268); set null on `background_tasks` (:197) and `simulations` (:212); no action on `payments` (:247)
and `credit_ledger.simulation_id`. **Financial rows (`payments`, `credit_ledger`) must not
cascade-delete with an org** — use `no action` for those two and `cascade` for the other five
(`simulations`, `user_profile`, `user_assumptions`, `user_correlations`, `background_tasks`). After
migration (C) every new column is `NOT NULL`, so `set null` is not available.

**Fix the ledger cascade while you are here.** After D7, `wallet_balance` cascades from `organization`
while `credit_ledger.user_id` still cascades from `user` — so **deleting one departing analyst deletes
their ledger rows and leaves the org wallet intact**, creating drift equal to that analyst's net delta
on the most routine B2B operation there is. Change `credit_ledger.user_id` to nullable
`ON DELETE set null` (which a platform-level admin grant needs anyway, having no acting user).

> **That change breaks two things — handle both in the same commit.** `spend.ts:153-154` passes
> `original.userId` into `grantCredits({ userId: string })`, so `pnpm --filter api typecheck` fails —
> the DoD's first line. And `GET /api/billing/ledger` (`billing/routes.ts:457-459`) filters
> `eq(creditLedger.userId, user.id)`, so set-null rows vanish from every user's ledger view while
> still counting in `reconcile.ts`'s SUM — permanent, silent drift between what a user sees and what
> the invariant checks. **Decide what a null-user ledger row displays before making the column
> nullable.**

**Do NOT add `organizationId` to:** `funds`, `prices`, `index_data`, `fund_exposures`, `key_figures`,
`credit_packages`.

**`walletBalanceRelations` at `schema.ts:347-352` references `walletBalance.userId`**, the column D7
drops. Delete or repoint it or `tsc --noEmit` fails.

**Align better-auth versions first.** `apps/api` resolves 1.6.20 (`^1.6.20`) while `apps/web` resolves
1.6.2 (`^1.6.2`). Inert today because `auth-client.ts` uses no plugins, but Phase 0/1 make
cookie-attribute and origin-check semantics load-bearing across an 18-patch gap. Bump `apps/web` to
`^1.6.20`.

### Task 0.3 — Migrations: **six files across three deploys**

**[v1 was wrong]** v1 implied one generated migration plus a hand-written backfill. That cannot apply
to production. All of the following was verified by running the real tooling against a restored dump.

**Prerequisite — get a real rehearsal target.** **[v1 was wrong]** v1 said "the `backups/` directory at
the repo root is the obvious source". **There is no `backups/` directory in the repo** — `git ls-files`
tracks no dump, `.gitignore` has no entry, and it is absent from a fresh clone. The one file on the
original developer's machine is a snapshot from migration `0000` whose table list contains no
`user_profile`, `wallet_balance`, `credit_ledger`, `payments` or `credit_packages` — it cannot rehearse
the wallet re-key at all.

```bash
turso db shell <db> ".dump" > /tmp/prod-20260902.sql     # creds from Render (sync: false)
# restore through libSQL, NOT the system sqlite3 CLI:
#   stock sqlite3 cannot parse the ALTER COLUMN ... TO ... in 0001_numerous_drax.sql:14,
#   and its DQS=3 (libSQL is DQS=0) turns loud errors into silent string corruption.
DATABASE_URL=file:./prod-copy.db pnpm --filter api db:migrate
# drizzle.config.ts loads no dotenv — without an explicit DATABASE_URL you silently
# migrate apps/api/portfolio.db instead.
```

**Migration (A) — generated.** New tables, plus `organization_id` as **NULLABLE** with its
`.references()` and index, plus `shared_with_org`.

> `db:generate` diffs the whole file, so (A) also carries the `credit_ledger.user_id`
> nullable/`set null` table rebuild from Task 0.2. Expect it and review it.
>
> **The idempotency index swap (Task 0.5, bug B1) lands with (C), not here.** SQLite treats NULLs as
> distinct in a unique index, so a composite `unique(organization_id, idempotency_key)` created while
> `organization_id` is still nullable constrains nothing at all.

> It **must** be nullable. For a NOT NULL column with no default, drizzle-kit emits
> ``ALTER TABLE `simulations` ADD `organization_id` text NOT NULL REFERENCES organization(id);``
> (`SQLiteAlterTableAddColumnConvertor`), which libSQL rejects with `Cannot add a NOT NULL column with
> default value NULL` on any populated table — and **silently succeeds on an empty dev DB, so it only
> fails in production.** [verified]
>
> Note in the migration file that this `ADD COLUMN` **silently drops `ON DELETE cascade`** — the
> convertor emits only `REFERENCES table(col)`, so the live FK is NO ACTION while the Drizzle snapshot
> claims cascade. Migration (C)'s rebuild installs the **declared** action — `cascade` for the five
> non-financial tables, `no action` for `payments` and `credit_ledger` per the `onDelete` rule in Task
> 0.2 — not cascade everywhere. A reviewer who sees `no action` in (C)'s output should not "fix" it.

**Migration (B) — `pnpm db:generate --custom --name=backfill_organizations`.**

> Do **not** drop a loose `.sql` into `drizzle/` — the runner iterates `meta/_journal.json`, not the
> directory.
>
> Put `--> statement-breakpoint` between **every** statement. A chunk containing two statements
> executes only the first, **with no error**, while the migration is still recorded as applied.
> [verified]
>
> Never leave the placeholder comment as a chunk's only content — a comment-only chunk errors with
> `SQLITE_UNKNOWN_0: not an error`.
>
> End with a guard that aborts on any unbackfilled row:
> `DROP TABLE IF EXISTS _backfill_guard;` then `CREATE TABLE _backfill_guard(x text NOT NULL);` then
> per table
> `INSERT INTO _backfill_guard(x) SELECT NULL FROM <table> WHERE organization_id IS NULL LIMIT 1;`
> then `DROP TABLE _backfill_guard;`
>
> The leading `DROP … IF EXISTS` matters: when the guard fires, the migration aborts *before* its own
> `DROP`, so a retry would otherwise die at `CREATE TABLE` with a different error — surfaced through
> the mute-failure mode §10 rule 2 documents.

What (B) does:

1. **One org per existing user.** `slug = 'u-' || lower(u.id)`. **[v1 was wrong]** v1 derived the slug
   from the email local-part; of the six real local-parts across both databases, **five are invalid DNS
   labels** — `luna.eric.santiago` yields a four-label host a `*.optim.app` wildcard cert does not
   cover, and `devtest+11059`, `proxy3214+27821`, `luna.eric.santiago+1` contain `+`. BetterAuth ids
   are 32-char alphanumerics: valid single label, unique by construction, no dedupe pass.
2. **`organization_member`** with `role = 'owner'`.
3. **`organization_settings` carrying *today's behaviour*, not the column defaults**:
   `advisor_mode = 'platform'`, `crypto_rail_enabled = 1`. The Task 0.2 defaults (`'off'`, `false`) are
   the *whitelabel* defaults; using them would silently hide the advisor CTA (rendered unconditionally
   at `MarkowitzResults.tsx:744`) and remove the crypto rail tab (`PackagePicker.tsx:68-80`) for every
   existing user — inside the phase whose DoD is "zero user-visible change".
4. **`organization_branding`** with today's values.
5. **`organization_domain`** rows. v1 omitted these entirely; with no row, no hostname resolves to any
   org and Task 1.1's lookup returns nothing on day one. **State which org owns the production
   hostname and sets `is_default = 1`** (§0.2 item 4), and what hostname — if any — the one-org-per-user
   rows get, since `organization_domain.hostname` is `notNull().unique()` and cannot simply be blank
   for all of them. The straightforward answer: personal orgs get **no** domain row at all, and reach
   the app through the default tenant.
6. **Backfill `organization_id`** on every scoped row.

**Orphan policy — required before step 6.** **[v1 was wrong]** v1 said "backfill from its owning user",
which does not work for the two tables whose `user_id` is nullable with `ON DELETE set null`. In the
only production snapshot anyone has, **22 of 23 simulations have `user_id IS NULL`** [verified by
loading the dump and counting]. **Orphans are the dominant case, not an edge case.**

```sql
SELECT count(*) FROM simulations      WHERE user_id IS NULL;   -- count FIRST
SELECT count(*) FROM background_tasks WHERE user_id IS NULL;
```

Then **delete them** (recommended — they are already unreachable, since every read/update/delete path
filters on `eq(simulations.userId, user.id)` at `simulations/routes.ts:22,51,131,165,173,192`), after
archiving. Deleting requires nulling any `credit_ledger.simulation_id` reference first — that FK is
`ON DELETE no action` (`drizzle/0004:13`). The alternative is a reserved platform org.

**Migration (C) — generated.** Flip to `.notNull()`, and swap in the composite idempotency index.

> **First, re-run the backfill idempotently** (`… WHERE organization_id IS NULL`) **and re-run the
> guard.** (B)'s guard proved zero NULLs at Deploy 1's *build* time; (C) runs days later, and any row
> written by the old release during Deploy 1's build window carries a NULL.

> Because `organization_id` carries an FK, Drizzle takes the safe table-rebuild path
> (`PRAGMA foreign_keys=OFF` / `CREATE TABLE __new_x` / `INSERT…SELECT` / `DROP` / `RENAME`) whose
> `INSERT…SELECT` rejects remaining NULLs. **Do not rely on that as your only guard.** For a
> **non-FK** column Drizzle instead emits libSQL's `ALTER TABLE … ALTER COLUMN "c" TO "c" text NOT
> NULL`, which rewrites the schema **without validating rows** — leaving NULLs in a column declared
> NOT NULL, where `WHERE col IS NULL` returns zero forever. Reproduced through the real pipeline on 23
> rows; `apps/api/drizzle/0001_numerous_drax.sql:14` is already this codepath. [verified]

**Migration (D) — the `wallet_balance` re-key, three steps, never one `db:generate`.**

> **[v1 was wrong]** v1 described this in one sentence. Doing it in one generate is unsafe *and*
> unrunnable: with `user_id` removed and `organization_id` added on the same table, drizzle-kit renders
> the interactive `Is <col> created or renamed from another column?` prompt and, with no TTY, aborts
> with `Interactive prompts require a TTY terminal`. Answering "renamed" emits
> `RENAME COLUMN user_id TO organization_id`, which **committed silently** against the migrated prod
> copy and left real user IDs sitting in `organization_id` with 2 dangling FK rows. Answering "created"
> emits a rebuild whose `INSERT INTO __new_wallet_balance("organization_id",…) SELECT "organization_id"…`
> reads a column that does not exist. [all verified]
>
> **(D-i)** generated — add nullable `organizationId` + FK, keep `userId` as PK.
> **(D-ii)** `--custom` — backfill driven from `organization` (LEFT JOIN through
> `organization_member`) so every org gets exactly one row, with a guard against two wallets mapping
> to one org.
> **(D-iii)** generated — drop `userId`, move the PK.
>
> *(Sub-steps are lettered, not numbered, because `D1`/`D2`/`D3` are locked-decision ids — and D7 is
> cited four lines below.)*
>
> **Cheaper alternative — take it unless there is a reason not to.** Keep `user_id` as a deprecated
> nullable column and add `organization_id` alongside it: nullable + FK in (D-i), backfilled in
> (D-ii), then flipped to `NOT NULL UNIQUE` inside (C) at Deploy 2. Be precise about what this saves —
> **the PK move and Deploy 3, not the rebuild and not the file count.** It is still the same
> table-rebuild path, because an FK-carrying column always is (see (C) below), and `ADD COLUMN … NOT
> NULL` with no default is still rejected by libSQL on a populated table (see (A) above).

#### Deploy grouping

`render.yaml:5` runs `db:migrate` inside `buildCommand` while the previous release is still serving
traffic, so **every migration must be backward-compatible with the code already deployed**. That
forces three deploys:

| Deploy | Migrations | The release that ships with it |
| --- | --- | --- |
| **1** | (A), (B), (D-i), (D-ii) | Contains **Task 0.4's org-context middleware** (you cannot stamp what you cannot resolve), all of Task 0.5's INSERT stamping, and Task 0.8's provisioning hook. **This is what "dual-writing" means here** — for the seven single-key tables it is simply stamping the new column; for `wallet_balance` it is writing both keys. Nothing yet *reads* `organization_id`. |
| **2** | (C) | The release whose SELECT / UPDATE / DELETE predicates read the new `organization_id` columns. |
| **3** | (D-iii) only | Ships *after* the org-keyed `spend.ts` is live. **Skip this deploy entirely if you take the cheaper alternative above.** |

Deploy 3 is the genuinely dangerous one: it drops `wallet_balance.user_id` while the previous release
still runs raw `WHERE user_id = ?` (`spend.ts:46-50`, `:101-105`). That is the window §0.2 item 5 asks
the human about — **not** the NOT NULL flip, which this split already makes safe.

### Task 0.4 — Org context in the API

In `apps/api/src/middleware/auth.ts`: after resolving the session user, look up their
`organization_member` row and `c.set("organizationId", ...)`. Extend `ContextVariableMap`. A user with
no membership throws 500 with a loud log.

**Add only `organizationId` to `ContextVariableMap`, and delete `optionalAuthMiddleware`.** It has
exactly one consumer in the repo — `tasks/routes.ts:16` — which D16 converts to `authMiddleware`
(also change `:17` from `c.get("optionalUser")` to `c.get("user")`). Drop the `optionalUser` entry
too; nothing else uses either. [verified by grep: they appear only at `middleware/auth.ts:9,34,36`
and `tasks/routes.ts:7,16,17`]

#### Org resolution without a session

**[v1 missed this entirely.]** Task 0.4's middleware is one mechanism; **three code paths write scoped
rows with no session** and cannot read `c.get("organizationId")`:

1. **Stripe webhook fulfilment** — `billing/routes.ts:35` and `:106-151`. The comment at :31 says
   webhooks are registered before `app.use("*", authMiddleware)` at :263 *on purpose*. It reads
   `session.metadata?.userId` at :112 and calls `grantCredits` at :144. **Resolve the org from the
   `payments` row it already loads at :127-129** — which is exactly why the INSERT at :358 must stamp
   `organizationId` in **Phase 0**, not Phase 2. Do **not** re-derive from the user's current
   membership: Stripe retries for up to 3 days, and under D3 a user who moves org in that window would
   have their firm's purchase credited elsewhere.
2. **Coinbase**, identical shape: :162, :222, :237-239, :252-258, INSERT at :427.
3. **Anonymous background tasks** — `tasks/routes.ts:16-28`, resolved by D16 (require auth).

**Make org-resolution failure `throw`**, so the handler's 500 triggers a provider retry. The existing
branches at :123 and :131 `return`, producing a 200 with no retry.

### Task 0.5 — Scope every query

**[v1 was wrong]** v1 enumerated ~22 sites and claimed the surface was "fully enumerated". There are
**~46**. Grouped by table:

- **`simulations` (8)** — `simulations/routes.ts`: 22 SELECT · 51 findFirst · **85 INSERT** · 94
  findFirst · 131 UPDATE · 165 UPDATE · 173 findFirst · 192 DELETE.
- **`user_profile` (9)** — `onboarding/routes.ts`: 49 · **53 INSERT** · 55 · 96 · 104 · 107 · 153 ·
  174 · 185.
- **`user_assumptions` / `user_correlations` (0)** — no query sites anywhere in the repo (schema,
  relations and exported types only). Add the column, but note there is **no endpoint for Task 0.6 to
  test**.
- **`background_tasks` (9)** — `tasks/routes.ts`: 22 INSERT · 33-35 UPDATE · 59-60 findFirst
  (**unauthenticated — bug B2**) · 88-89 findFirst (**not owner-scoped — bug B3**) · 100-103 UPDATE
  (not owner-scoped); plus **`apps/api/src/modules/tasks/yahoo-updater.ts`** — *a file v1 never
  mentions* — :13-16, :47-48, :122-130, :134-141.
- **`wallet_balance` (7)** — `spend.ts`: 12-15 INSERT · 46-50 raw UPDATE · 55-56 · 101-105 raw UPDATE ·
  107-108; `billing/routes.ts`:268-269; `reconcile.ts`:9-26.
- **`credit_ledger` (7)** — `spend.ts`: 21-22 findFirst by idempotencyKey (**unscoped — bug B1**) ·
  **62-70 INSERT** · **114-122 INSERT** · 139-140; `billing/routes.ts`:457-459 + 461-465;
  `reconcile.ts`:9-26.
- **`payments` (7)** — *v1 listed **zero*** — `billing/routes.ts`: 127-129 · 137-140 · 154-157 ·
  237-239 · 246-249 · **358-368 INSERT** · **427-437 INSERT**. The two INSERTs fail at runtime on the
  first checkout after `payments.organization_id` becomes NOT NULL.
- **`schema.ts`** — `walletBalanceRelations` :347-352 (see Task 0.2).

**Indirect call sites needing an `organizationId` argument:** `onboarding/routes.ts:177`
(`grantCredits`); `billing/routes.ts:144` and `:252` (`grantCredits`, webhooks, no session);
`billing/routes.ts:492` (`spendCredit`); `spend.ts:153` (`reverseSpend`); `metering.ts:14,:25`;
`optimization/routes.ts:48,196,276,361` and `:170,251,336,384`.

**`sharedWithOrg` — split read from write.** Five of the six sites in `simulations/routes.ts` (`:51`,
`:131`, `:165`, `:173`, `:192`) use the byte-identical predicate
`and(eq(simulations.id, id), eq(simulations.userId, user.id))` and *will* be copy-pasted; the list
query at `:22` uses `eq(simulations.userId, user.id)` alone.

- **READ** (:22 list, :51, :173): `organizationId = ? AND (userId = ? OR sharedWithOrg = 1)`
- **WRITE** (:131 PATCH, :165 PUT, :192 DELETE): `organizationId = ? AND userId = ?`

Sharing grants read, never write. This collides with Task 0.6's "404, not 403" rule: a row that is
readable but not writable cannot honestly 404 on a write. **Use 403 for that specific case — and
produce it like this**: each of the three write handlers (PATCH `:128-139`, PUT `:158-170`, DELETE
`:185-197`) becomes *look up with the READ predicate, then write with the WRITE predicate* — 404 if
the read finds nothing, 403 if the read finds it but the write matches nothing. Three handlers, one
shape. As written today the handlers learn only that zero rows changed and cannot tell the two cases
apart.

**On `simulations/routes.ts:94`** — this read looks unfiltered but is safe: `id` comes from
`crypto.randomUUID()` at :82, the zod schema at :68-72 accepts only name/params/result, and nothing
between :82 and :94 can change it. [verified] **Apply the WRITE predicate anyway**
(`organizationId = ? AND userId = ?`), or delete the read and use `.returning()` on the insert at :85.
Task 0.6's verification step ("fails if any `where` clause is removed") depends on every query in the
file looking the same; a deliberate unfiltered exception is indistinguishable from an oversight to the
next reviewer, and the fix costs one line while removing a redundant round-trip.

**Fix bugs B1, B2, B3 (§0.1) in this task.**

For **B1**: add the org predicate to the `spend.ts:21-23` lookup **and** replace the global `unique()`
on `credit_ledger.idempotency_key` (`schema.ts:273`) with a composite
`unique(organization_id, idempotency_key)`. Adding the predicate *without* changing the index makes a
replayed foreign key deduct credits and then hit the UNIQUE violation, rolling back into a 500. (The
index swap lands with Migration (C) — see Task 0.3.)

> **Do not change the key format.** An earlier draft of this plan said to namespace it as
> `${orgId}:${clientKey}`. That would orphan every pre-deploy key, and both server-written formats
> are load-bearing for *real* idempotency: a Stripe retry of `purchase:${session.id}`
> (`billing/routes.ts:148`; retries run for 3 days, per Task 0.4) and `signup-grant:${user.id}`
> (`onboarding/routes.ts:177-182`, whose **only** re-grant guard is the key matching an existing row —
> `POST /api/onboarding/complete` has no already-completed check). Changing the format re-grants on
> both paths. **The fix for a billing bug must not create one.** If namespacing is adopted for some
> other reason, Migration (B) must rewrite existing `credit_ledger.idempotency_key` values into the
> new form in the same statement batch.

**Give `assertWalletLedgerInvariant` a runnable entry point.** Task 0.3 and Phase 2's DoD both require
it, but it is invoked from exactly one place — `index.ts:59`, guarded by
`if (process.env.NODE_ENV !== "production")` at :58 — and no package.json script runs it. Add a script
under **`apps/api/src/scripts/`** (not `apps/api/scripts/` — the latter is outside `tsconfig.json`'s
`rootDir`/`include` and outside `eslint src/`, so the DoD's own typecheck would not cover it) plus a
package.json script to run it. **Keep both versions**: the pre-migration run
must use the existing user-keyed query (`reconcile.ts:9-26`) because `wallet_balance.organization_id`
does not exist yet; add a second org-keyed function for after. One rewritten function fails with
`no such column` rather than reporting drift. Rename `DriftRow`'s `user_id` key (:4).

### Task 0.6 — Isolation test harness, then isolation tests

**[v1 was wrong]** v1 said "`vitest` is already configured in `apps/api` (`pnpm test`)" and treated the
assertions as the work. **The harness does not exist, and building it is the work.** [verified]

The complete test inventory is four files: `apps/api/src/lib/dates.test.ts` (which imports nothing but
`./dates.js`) plus three pure-function tests in `apps/web/src/lib/`. `apps/api/vitest.config.ts` sets
only `environment: "node"` and an include glob — **no `setupFiles`**. And `apps/api/src/db/index.ts:5-11`
builds the libSQL client at **module scope** from `env.DATABASE_URL`, with `spend.ts:4` importing that
singleton directly — so importing any route module **opens a real connection at import time**.

The harness is three decisions, all of which belong in **this** task rather than being deferred:

**(a) Extract the composed Hono app into `apps/api/src/app.ts`**, leaving `serve()` and the
`assertWalletLedgerInvariant()` call in `index.ts`. Today both run at module scope (`index.ts:53-62`),
so importing the app in a test **binds port 8001 and opens a real libSQL connection**. `index.ts` does
export the app, but importing it is unusable in a test until those side effects move.

**(b) Add `setupFiles` to `apps/api/vitest.config.ts`** pointing `DATABASE_URL` at a per-worker temp
file and applying the **committed** migrations via `migrate()` from `drizzle-orm/libsql/migrator` — tests must
exercise the same files production runs, not regenerate schema. Decide the `db/index.ts`
client-factory question here (it touches every import site).

**(c) Seeded sessions cannot come from `auth.api.signUpEmail` unmodified** — `auth.ts:39` sets
`sendOnSignUp: true` and `lib/email/client.ts:7-11` throws without `RESEND_API_KEY`. Either stub the
send or insert `user` / `session` rows directly.

Then the assertions, in `apps/api/src/modules/__tests__/tenant-isolation.test.ts`: for every scoped
endpoint, org A's session cannot read, update, delete, or enumerate org B's rows, returning **404 not
403** (except the shared-simulation write case above). And `spendCredit` for a user in org A never
moves org B's balance.

### Task 0.7 — Tenant-tagged logging

Add `organizationId` to the logger context and to error reporting. *Note: v1 stated this as though a
structured Hono logger context already exists and "every `console.error`" is a known enumerable set.
Nobody has verified either. Scope it when you get there.*

### Task 0.8 — Org provisioning for new signups **(blocker — v1 missed this entirely)**

**Nothing in the codebase or in v1 creates an `organization` + `organization_member` for a new
signup.** `apps/api/src/lib/auth.ts` (99 lines, read in full) has no `databaseHooks`;
`emailAndPassword.enabled` is true and three social providers are configured. Combined with Task 0.4's
"throw 500" rule, **the first authenticated request of every account created after Phase 0 deploys
returns 500** — and D5 keeps D2C signup alive.

Preferred: `databaseHooks.user.create.after` creating org + owner membership + `organization_settings`
(`advisor_mode = 'platform'`, `crypto_rail_enabled = 1`, `signup_grant_credits = 3` — **the D2C
behaviour set, matching backfill step 3, not the Task 0.2 column defaults**, which are the whitelabel
defaults) + `organization_branding`, in one transaction. Alternative: the existing onboarding
`ensureRow` path (`onboarding/routes.ts:47-58`).

Decide whether a self-signup gets its own personal org or joins the D2C org (§0.2 item 4). **These are
not equivalent options:** joining the D2C org means, under D7, that every self-signup shares one credit
wallet and one shared-simulation read scope with every other signup. **Cover it with a test.**

*Two cautions: `databaseHooks` is the natural mechanism but was not exercised against 1.6.20; and a
transaction inside a create hook is exactly the shape Task 0.0(b) measures — overlapping
`db.transaction()` calls against libSQL fail rather than serialise.*

### Task 0.9 — Provisioning CLI and local dev seed **(v1 had no task for either)**

D13 makes an internal CLI the only way a tenant exists, and the only way a second analyst gets an
account — yet v1 had no task for it.

**The pattern to copy already exists:** `apps/api/src/scripts/seed-billing-packages.ts`, a one-shot
tsx CLI documented at its line 7 as `pnpm tsx src/scripts/seed-billing-packages.ts`. No `package.json`
script wraps it; add one for the provisioning CLI and for the drift check (Task 0.5).

It writes `organization`, `organization_member`, `organization_settings`, `organization_branding`,
`organization_domain`. Two things it must specify that nothing currently does:

- **How it creates the analyst's account.** `emailAndPassword` is enabled (`auth.ts:26-27`), so
  credentials live in BetterAuth's `account` table with its own hashing and **cannot be written by
  hand**, and no admin plugin is installed (`plugins: [expo()]`). Name the BetterAuth API the CLI
  calls, how the initial password reaches the analyst, and whether `sendOnSignUp` verification is
  suppressed or `emailVerified` pre-set.
- **What happens when the analyst already has a D2C account.** `unique('org_member_user_unique')`
  (D3) means they cannot simply be added to the tenant org — and for the first customer this is the
  *normal* case, not the edge case.

The CLI **refuses to provision** without the support email, privacy URL, and terms URL (§0.2 item 3).

**Directly coupled: local dev seeding.** After Phase 0 a fresh `file:portfolio.db` has no
`organization`, so under Task 0.4's rule **every local signup is broken until someone runs a seed that
does not exist.** This is the thing that will burn the second engineer on this project.

### Phase 0 definition of done

- `pnpm --filter api test` and `pnpm --filter api typecheck` pass. *(Note: there is no root `typecheck`
  script and `turbo.json` has no `typecheck` task — see §10.)*
- All six migration files apply cleanly, in deploy order, to a **fresh** production copy.
- `PRAGMA integrity_check` returns `ok` and `PRAGMA foreign_key_check` returns 0 rows.
- Wallet/ledger invariant holds before (user-keyed) and after (org-keyed).
- Isolation tests cover every scoped endpoint and fail if any `where` clause is removed — **verified by
  a manual mutation pass**: remove one org predicate per table, confirm exactly one test fails, restore.
  (No mutation-testing tool exists in either package.json.)
- Bugs **B1–B5** fixed with regression tests.
- A new signup gets an org (Task 0.8), verified by test.
- **`pnpm dev` works from an empty database** via the Task 0.9 seed, and the CLI provisions a tenant
  end to end.
- A webhook test proves org resolution from the `payments` row, and that failure **throws** (so the
  provider retries) rather than returning 200.
- **Zero user-visible change** — including the advisor CTA and crypto rail still rendering for existing
  users, **and for an account created after the deploy**.

---

## 5. Phase 1 — Branding

### Task 1.0 — Gate: verify the network path, and fix tenant-blind auth emails

Run the §3.2 verification **before** designing anything else in this phase.

**Transactional email URLs are tenant-blind and this is Phase 1 work, not Phase 2.**
`apps/api/src/lib/auth.ts:30` and `:43` both build `${env.FRONTEND_URL}/auth/...` — one hardcoded host
for all tenants — and `:40` sets `autoSignInAfterVerification: true`. Under any host-scoped cookie
model, **verifying an email signs the user in on the D2C host and they arrive at their tenant hostname
logged out.** `sendResetPassword` also **ignores** the `redirectTo` the client sends
(`app/auth/forgot-password/page.tsx:19-22` sends `${window.location.origin}/auth/reset-password`) and
emails the `FRONTEND_URL` link regardless. Resolve the user's org → its `organization_domain.hostname`
and build both links from that. **Define the fallback**: when the org has no domain row — which is
every personal org after the backfill (Migration (B) step 5) — use the default tenant's hostname
(`organization.is_default`). This is the recovery path from §3.2's session-invalidating cutover, so it
cannot be left undefined.

**Email is a fourth brand surface nobody had opened.** `apps/api/src/lib/email/i18n.ts` hardcodes
`brand: "Optimización de Portafolio"` / `"Portfolio Optimization"`, rendered at `VerifyEmail.tsx:31`
and `ResetPassword.tsx:31`. Task 1.4 hoists brand values only out of `apps/web/messages/*.json`, so the
brand string *inside* every transactional email survives untouched. And `EMAIL_FROM` is a single env
var (`send.ts:19`) — every tenant's mail arrives from our address on our sending domain. Per-tenant
sender identity needs per-tenant DNS/SPF/DKIM: a real ops project, and a more visible break of the
illusion than the OAuth consent screen §9.2 discusses at length.

### Task 1.1 — Host-based tenant resolution

Create `apps/web/src/middleware.ts`. Read `Host`, look up `organization_domain`, attach `x-org-id` /
`x-org-slug`. Unknown host serves the default (D2C) tenant, not a 404.

**The data path does not exist yet — v1 assumed one.** `apps/web/src/lib/api.ts` is browser-only in
**both** of its branches: absolute URL + `credentials: include` when `NEXT_PUBLIC_API_URL` is set
(today's production, per §3.2), relative `/api` + `same-origin` otherwise. Either way there is **no
server-side API client anywhere in `apps/web`**. A relative fetch from a server component throws (no
base URL), and `next.config.js` rewrites **do not apply to server-side fetches**. So both Task 1.1's
"in-memory map refreshed from the API" and Task 1.3's "fetch branding server-side" need a mechanism
that has to be built — including a new **unauthenticated** endpoint (`GET /api/tenants/by-host`) which
is itself **a public enumeration surface for your entire client list**. Design it with that in mind.

### Task 1.2 — `deriveTenantPalette`

Create `apps/web/src/lib/tenant-palette.ts` — a pure function from one accent hex to the complete
derived set, with unit tests. It must produce, for both light and dark: `--primary`,
`--primary-emphasis`, `--ring`, `--gradient-gold-from`, `--gradient-gold-to`, `--glow-strong`,
`--glow-soft`; the `ChartColors` hex set; and the PDF colour constants.

Three non-negotiable rules:

1. **Contrast.** Compute against `--background` in both themes and auto-adjust lightness to 4.5:1 — do
   not reject the tenant's colour. Mirror `--primary-emphasis`: move *away* from the page in each theme.
2. **Semantic collision (D10).** `danger` stays red, gain/loss stay green/red. If the accent falls in
   the red hue range, nudge it out for chart series use only — otherwise a tenant with a red brand gets
   a chart where "your portfolio" reads as "you lost money".
3. **Hex output for charts.** `chart-theme.tsx:44` documents that call sites build alpha by string
   concatenation (`${color}55`; `${colors.danger}1f` at `DrawdownChart.tsx:94`). Keep emitting real hex.

`simulation-pdf.test.ts` already exists and asserts against the current constants — it will need
updating.

### Task 1.3 — Inject branding without a flash

Read the org from the middleware headers, fetch branding server-side (via the mechanism Task 1.1
builds), emit an inline `<style>` in `<head>` overriding accent tokens on `:root` and `.dark`, set
title and favicon via `generateMetadata()`. Server-rendered CSS means there is no flash to correct.

### Task 1.4 — Hoist `Brand` and `Metadata` out of the message files

Remove those namespaces from `apps/web/messages/{es,en}.json`; provide them as runtime tenant config
from the root layout through a new `TenantProvider` alongside `NextIntlClientProvider`. Update
`Header.tsx:44-45`, `Sidebar.tsx:25-26`, and anything else calling `useTranslations("Brand")`.

**Add a sentence to `CLAUDE.md`** making the distinction explicit — "never hardcode UI strings" still
holds for everything else; brand values are *tenant data*, not translated copy — so the next person
does not "fix" it back into the message files.

### Task 1.5 — Logo, favicon, fonts

- **Storage.** For the first 1–3 tenants, commit assets to `apps/web/public/tenants/<slug>/`. **Flag the
  contradiction:** this means a tenant changing their logo requires a code deploy, while D13 and Task
  1.7 promise self-serve branding. Resolve it by moving to Vercel Blob when Task 1.7 ships, or accept
  it explicitly for the first customer.
- **Fonts.** Importing all six at module scope means **every tenant pays the CSS and preload cost of the
  five they do not use.** Decide how to avoid that (subsetting, `display: optional`, or accepting it).
- **Favicon.** There is no `favicon.ico` convention in `app/`, so per-tenant icons go through
  `generateMetadata` — unverified.

### Task 1.6 — Brand the surfaces

Sidebar/header wordmark · tab title + favicon · **PDF export** (replace the 8 constants at
`simulation-pdf.ts:22-29`; remember it renders **client-side**, so branding comes through client props
and a logo needs a data URI) · auth screens · onboarding · transactional email (Task 1.0).

**Do not tint the 3D globe** (`ZoomGlobe.tsx`) — it is a cinematic scene framed by the `--scene-*`
tokens.

**"Powered by"** renders only when `organization.tier = 'cobranded'` (D14).

*Open product question worth raising with the client:* the PDF is dark-background by design. That costs
a tenant real toner when their client prints it, and reads as "someone else's template" more than any
other surface. Consider a light/paper variant.

### Task 1.7 — Branding settings page

`app/(app)/settings/branding`, `role = 'owner'` only: product name, accent (colour picker with live
contrast warning), font, logo, support email, privacy/terms URLs, disclaimer text. Highest ratio of
perceived value to build cost in the project.

### Task 1.8 — Caching

**Establish the baseline first — v1's five bullets were written without a file being read.** The app
today has zero `export const dynamic`, zero `revalidate`, and zero `unstable_cache`; but
`app/layout.tsx` and `i18n/request.ts` both call `cookies()` from `next/headers`, **which already forces
dynamic rendering for every page under the root layout.** That substantially lowers the risk v1
asserted.

The real exposures: the three Next route handlers under `/api` (locale, theme, historical/search); the
Data Cache on any server-side `fetch` added in Phase 1; `generateMetadata`; and Vercel's CDN behaviour
with `Vary: Host`. Audit those specifically, then add `Vary: Host` and org-keyed cache keys where they
apply.

### Task 1.9 — Web test harness *(a deliverable, not an assumption)*

`apps/web` has three tests, all pure-function; no Playwright, no e2e, **no way to drive a request with
a synthetic `Host` header** — which is what both Phase 1 DoD gates require. Build it as its own task,
the way Task 0.6 does on the API side: Playwright, or a Next request-level test that can set `Host`,
with two seeded orgs on two hostnames. It gates "two hostnames render two brands" and "cache-bleed
test passes", so it must land before either can be claimed.

### Phase 1 definition of done

The Task 1.9 harness exists. Two hostnames render two brands with no flash. PDF carries tenant
branding across all three colour systems. Cache-bleed test passes. `trustedOrigins` is request-scoped
and the CORS allowlist accepts every tenant host (both from Task 1.0). `pnpm build` succeeds. Light and
dark both pass a contrast check with a deliberately awkward accent (pale yellow is the good
adversarial case).

---

## 6. Phase 2 — Org billing

### Task 2.0 — moved to Phase 0

Both prerequisites now live in **Task 0.0**: the orphan-commit fix (B4) lands against the current
per-user schema, which only exists before Migration (D); and the write-contention measurement gates
D7, a Phase 0 schema decision. Phase 2's DoD test "the concurrent-same-key race" will fail on
connection locking rather than idempotency until Task 0.0(b) is resolved.

### Task 2.1 — Wallet moves to the org

Rewrite `spend.ts`: `ensureWalletRow(organizationId)`; both raw SQL statements change
`WHERE user_id = ?` → `WHERE organization_id = ?`; `spendCredit` / `grantCredits` take
`{ organizationId, userId, … }`; `reverseSpend` reads both from the original ledger row. Update
`meterRequest` in `metering.ts`.

**Preserve** the conditional-`UPDATE` atomicity and the transaction-scoped `balanceAfter` re-read
(`spend.ts:55-57`, `:107-109` correctly use `tx.query`, not `db.query`). **Do not preserve** the
unscoped idempotency replay (fixed in Task 0.5) or the race-loser recovery (fixed in Task 0.0a) —
**[v1 was wrong]** v1 said "preserve the existing idempotency semantics exactly", which instructs the
implementer to preserve two latent bugs that org-keying makes far more reachable.

*Refuted, so it is not over-scoped:* `grantCredits` not checking `rowsAffected` is worth an assert but
is **not** a blocker — FKs are enforced (`PRAGMA foreign_keys` returns 1 on a fresh libSQL connection)
and `ensureWalletRow` throws on a nonexistent org before the unchecked UPDATE is reached. [verified]

### Task 2.2 — Overdraft

`credits - cost >= -overdraft_limit`, limit from `organization_settings`. Default 0 preserves today's
behaviour exactly. Never hard-block a paying tenant in front of their own client.

### Task 2.3 — Admin credit grant

An admin-only endpoint writing a `reason: 'grant'` ledger row against an org — how invoiced customers
get credits. **There is no platform-admin concept in the API today** (no role column on `user`, only
two middlewares, `plugins: [expo()]` only). Options: BetterAuth's `admin` plugin, an `ADMIN_USER_IDS`
env allowlist, or a shared-secret internal route in the style `CRON.md` proposes. **Security/product
decision — see §9.**

### Task 2.4 — Usage view

Credits by user, simulations run, recent activity. **Open product question:** after D7, `/wallet`
becomes org-wide while `/ledger` still filters `eq(creditLedger.userId, user.id)` — so a member sees an
org balance above a personal subset of rows whose `balanceAfter` cannot reconcile with the visible
deltas. Decide what a non-owner sees; it changes whether this is one endpoint or two.

### Task 2.5 — The signup grant multiplies per seat **(v1 omitted this call site)**

`onboarding/routes.ts:177-182` grants `SIGNUP_GRANT_CREDITS` (a module const of 3 at :10, not an env
var) with key `signup-grant:${user.id}` on every onboarding completion. Once `grantCredits` writes to
the org wallet, **a 40-seat tenant injects 120 free credits into the wallet it is being invoiced for** —
and D8 makes that pure leakage. Hence `organization_settings.signupGrantCredits` in Task 0.2: set it to
0 for whitelabel tenants.

### Task 2.6 — Low-balance email · Task 2.7 — Hide the crypto rail

At 20% of the last top-up, email the owner (branded per Task 1.0). Gate the Coinbase rail behind
`crypto_rail_enabled`.

### Phase 2 definition of done

Org-level wallet/ledger invariant holds. Idempotency tests pass **including the concurrent-same-key
race** (which requires Task 0.0b). Two users in one org share a balance; another org is unaffected.
`PAYMENTS.md` updated in the same PR (D7 reverses its stated non-goal).

---

## 7. Phase 3 — Tenant product controls

### Task 3.1 — Fund allowlist

Filter the Yahoo search through `organization_settings.fund_allowlist` when non-empty.

**The ticker search exists twice.** `apps/web/src/app/api/historical/search/route.ts:25` is a
near-identical Next.js App Router handler calling Yahoo directly. Which one the app reaches depends on
`NEXT_PUBLIC_API_URL`: `AssetAllocationForm.tsx:65-67` builds
`${process.env.NEXT_PUBLIC_API_URL || ""}/api/historical/search`, so it calls the API host directly
when that is set (today's production, per §3.2) and the relative path otherwise — where array-form
`rewrites()` are `afterFiles`, so the colocated route wins.

Either way **the Next route stays publicly reachable** at `https://<tenant-host>/api/historical/search`,
so filtering only the Hono handler (`historical/routes.ts:33`) leaves the allowlist bypassable by hand.
**Apply the allowlist to both.** Delete the Next route only if Task 1.0's verification proved the
rewrite reaches the API in production.

### Task 3.2 — Academia toggle

Gate `/academia` and its nav entries on `academia_enabled`. Keep `Sidebar.tsx` and `MobileTabBar.tsx`
in sync per `CLAUDE.md`.

### Task 3.3 — Advisor CTA *(handle before the first tenant demo)*

Today the CTA books "**nuestro** asesor financiero" via our Cal.com for 100 credits, rendered
unconditionally at `MarkowitzResults.tsx:744`. On a tenant's branded app this routes *their* clients to
*our* advisor — channel conflict, and in most jurisdictions a licensing problem.

Three modes from `advisor_mode`: `off` (default for whitelabel), `platform` (today's D2C behaviour),
`tenant` (their own URL and cost). Move `ADVISOR_BOOKING_URL` / `ADVISOR_CALL_COST_CREDITS` off
`config/env.ts` onto the org row. Fix the possessive in the copy.

### Task 3.4 — Org-shared simulations · Task 3.5 — Mandatory disclaimer · Task 3.6 — Data export

Surface `sharedWithOrg` (read/write split per Task 0.5). Render `disclaimerText` in app and PDF —
**wording** tenant-editable, **presence** not, falling back to our default. Org-scoped JSON dump,
admin-triggered.

---

## 8. Explicitly out of scope

SSO · custom domains · per-tenant OAuth apps · per-seat credit limits · data residency ·
tenant-uploaded instruments (*possibly the actual killer feature — scope it as its own project*).

**Mobile (D12) is out of scope but not untouched** — a claim v1 made about code nobody had read.
`apps/mobile` calls the same optimize/simulations/billing endpoints with a manual Cookie header, so a
mobile user with no org membership hits **the same Task 0.4 500**; its billing screens read a wallet
that becomes org-shared under D7; and `apps/mobile/package.json` declares `react-native-web` with an
`expo start --web` script, which would reintroduce a real browser cookie jar hitting the API cross-site.

**`CRON.md` is unimplemented** (no `modules/schedules`, no `app/api/cron`, no `crons` key in
`vercel.json`), so "works per-tenant as-is" is untested. It adds **three more user-scoped tables**
(`simulation_schedules`, `schedule_simulations`, `simulation_runs`) that Task 0.2 does not cover, and
its runner calls `spendCredit({userId, …})` from a sessionless `POST /api/internal/run-schedules` — a
**fourth** sessionless org-resolution path. If CRON ships first, Phase 0 must scope its three tables; if
Phase 0 ships first, `CRON.md` needs an org-aware `spendCredit` signature.

**Rollback.** Drizzle generates no down-migrations, §10 mandates one deployable increment per PR, and the wallet re-key
is destructive. Because `db:migrate` runs in `buildCommand`, **rolling back the code does not roll back
the schema.** Write the rollback procedure before Deploy 2.

---

## 9. Escalate — do not decide these alone

**9.1 — How many tenants in 12 months?** At three, per-tenant deploys plus a config file would have been
right and much of this is over-engineering. At fifteen, all of it is necessary. This plan assumes 4–15.

**9.2 — OAuth: nothing to decide, but a constraint to record.** **[v1 was wrong]** v1 asked the client to
approve "email+password only for whitelabel tenants". **The web app has no social sign-in at all** — a
grep across `apps/web/src` and both message files returns only a `next/font/google` import;
`AuthModal.tsx:44,55` uses `signUp.email` / `signIn.email` only. `socialProviders` is configured
server-side but the web client never calls it; social sign-in exists only in `apps/mobile`, which D12
puts out of scope. **So it is already the shipped behaviour. Remove the ask.**

Record instead the forward-looking constraint: **adding web OAuth under a same-origin proxy design
breaks outright.** BetterAuth derives `redirect_uri` from `baseURL` (`auth.ts:20` = `BACKEND_URL`) while
the state/PKCE cookie would be set on the tenant host, so the callback finds no state cookie. Web OAuth
and the proxy are mutually exclusive without per-tenant redirect URIs — a total failure, not a branding
problem.

**9.3 — Liability for the advice.** The highest non-technical risk. Task 3.5 implements a mandatory
disclaimer, but the wording and the back-to-back contract clause want a lawyer's 30 minutes before the
first tenant goes live. If no privacy policy or ToS exists at all (§0.2 item 3), that is part of this.

**9.4 — Reversing a `PAYMENTS.md` non-goal.** D7 contradicts a documented decision. Update
`PAYMENTS.md` in the Phase 2 PR.

**9.5 — Admin authority model** for Task 2.3. **9.6 — Deploy window** for Migration (D-iii), which drops `wallet_balance.user_id` under the
still-serving release — or the decision to take the Migration (D) alternative and skip Deploy 3
entirely (§0.2 item 5).

---

## 10. Working agreements

**Migration operations** — all four verified by execution:

1. **`render.yaml:5` runs `db:migrate` inside `buildCommand`** while the previous release serves
   traffic, so every migration must be backward-compatible with deployed code. There is **no
   `preDeployCommand`**, so v1's alternative of "a one-shot script run before the constraint lands" has
   nowhere to run — struck.
2. **`drizzle-kit migrate` fails mutely in CI**: a failing set exits 1 with **0 bytes on stderr** and
   only a spinner on stdout. A failed migration shows as a Render build failure with no diagnostic.
   Always run the assembled migration against a prod copy locally first, where the error is visible.
   "It will fail loudly" is a false safety net.
3. **After any branch merge, verify `drizzle/meta/_journal.json` timestamps are strictly increasing.**
   The libSQL migrator compares each pending file's `when` against only the most recently applied row,
   so a migration landing with an earlier timestamp is **skipped forever, silently.**
4. `PRAGMA integrity_check` (must be `ok`) and `PRAGMA foreign_key_check` (must be 0 rows) are
   post-migration gates. The whole batch runs with `PRAGMA foreign_keys=off`, so no FK validation
   happens during the backfill, and `integrity_check` is the only thing that catches ALTER-COLUMN
   NOT-NULL corruption.

**Drizzle `relations()`** — no nested `with:` across a tenant boundary without an explicit org
predicate. Relational traversals apply the outer query's `where` only to the outer table.
`schema.ts:366-379`, `:354-364` and `:282-288` are all unguarded nested paths. A grep for `with:` returns
zero hits today, so there is no live leak — but Task 2.4's usage view is exactly where someone writes
one.

**CI does not enforce this plan's definition of done.** There is no root `typecheck` script and
`turbo.json` has no `typecheck` task — it exists only as `pnpm --filter api typecheck`, and
`.github/workflows/ci.yml` says to run it locally because `.d.ts` emission is disabled (TS2742 on
better-auth's inferred type). CI's test step is `turbo run test -- --passWithNoTests`. **So the
mandatory isolation test could be deleted, skipped, or never written and CI would stay green**, and the
typecheck break D7 causes via `walletBalanceRelations` would surface only on someone's laptop. Add a
`typecheck` turbo task and drop `--passWithNoTests`.

**Also**: migrations follow the `CLAUDE.md` workflow, never `db:push` · every new user-facing string
goes in both `es.json` and `en.json` (brand values are the documented exception) · never hardcode a
colour · DD/MM/YYYY in charts · **one deployable increment per PR** (Phase 0 is three PRs, and Task 0.0
is its own) · every org-scoped table lands with its isolation test
in the same commit.

**Env and ops, unexamined and needed:** no `API_URL` in `render.yaml`, no env block in `vercel.json`, no
`apps/web/.env.example`, and `docker-compose.yml` sets `NEXT_PUBLIC_API_URL=http://api:8000` against an
API that defaults to 8001 (stale). D6 assumes wildcard DNS and a wildcard TLS cert on the Vercel
project — an ops prerequisite with real lead time that nothing has verified.

---

## 11. Sequencing

| Phase | Ships to users |
| --- | --- |
| **0 — Tenancy foundation** (Task 0.0 first, then three deploys — see Task 0.3) | Nothing visible |
| **1 — Branding** (gated on §3.2 verification) | The demoable feature |
| **2 — Org billing** (gated on Task 0.0) | Owner-facing |
| **3 — Product controls** | Per-tenant configuration |

Phases 2 and 3 are largely independent and can be reordered to suit a customer conversation. **Phase 0
must come first, and Phase 1 must not start before it lands.**
