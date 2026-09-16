# Whitelabel — Open Questions

Everything I need answered (or need you to explicitly defer) before `WHITELABEL.md` can be
written as a spec rather than a wish. Every question carries **my recommended answer**, so the
fastest path is: read down, say "defaults except 4, 11, 23", and I'll write the spec from that.

Questions marked **BLOCKING** change the shape of the architecture — the spec cannot be written
without them. The rest change details and can be deferred with a stated assumption.

Grounded in the codebase as of `38a2d30`. Code references are load-bearing: they're where the
work actually lands.

---

## 0. What the code says today (so we argue about facts, not memories)

| Area | Current state | File |
| --- | --- | --- |
| Tenancy | **None.** No org/tenant/team table. Every scoped table hangs directly off `user.id`. | `apps/api/src/db/schema.ts` |
| Auth | BetterAuth, one `baseURL`, one set of OAuth client IDs, `trustedOrigins: [FRONTEND_URL, …]` | `apps/api/src/lib/auth.ts` |
| Billing | Per-**user** credit wallet. `PAYMENTS.md` §1 lists "multi-tenant / org wallets" as an explicit **non-goal**. | `apps/api/src/modules/billing/routes.ts`, `PAYMENTS.md` |
| Branding | Text only — no logo asset anywhere. `Brand.shortName` = "Optim.", `Brand.fullName` = "Portafolio", rendered with `.text-gradient-gold`. | `messages/es.json`, `Header.tsx:43`, `Sidebar.tsx:24` |
| Colour | All tokens in `:root` / `.dark`. Well-disciplined — genuinely re-skinnable. | `apps/web/src/styles/globals.css` |
| Chart colour | **Hex literals**, two hardcoded sets, *not* CSS vars — because call sites do `${color}55` to build alpha. | `apps/web/src/components/charts/chart-theme.tsx:44` |
| PDF colour | A **third, separate** palette — 8 hardcoded hex constants, dark-only, sharing nothing with `globals.css` or `chart-theme.tsx`. | `apps/web/src/lib/simulation-pdf.ts:22-29` |
| Fonts | Hardcoded `Instrument_Sans` + `Manrope` via `next/font/google` at module scope. | `apps/web/src/app/layout.tsx:3` |
| Routing | **No `middleware.ts` in `apps/web`.** No host-based anything exists. | — |
| Deploy | One Vercel project, one Render service, one Turso DB. | `vercel.json`, `render.yaml` |
| Email | One `EMAIL_FROM`, two templates (verify, reset). | `apps/api/src/config/env.ts`, `lib/email/templates/` |
| Ticker universe | **Unrestricted** — live Yahoo search, any EQUITY/ETF on earth. | `apps/api/src/modules/historical/routes.ts:22` |
| Advisor | Cal.com link + "nuestro asesor financiero", 100 credits. | `env.ts` `ADVISOR_BOOKING_URL`, `messages/es.json` `AdvisorCta` |
| Academia | 5 hand-authored educational stations + 3D globe. | `apps/web/src/components/academia/` |

**The single most important fact:** the colour system is clean enough that re-skinning is *cheap*.
The tenancy layer does not exist at all, so multi-tenancy is *expensive*. Any answer that lets us
sell "whitelabel" while deferring real tenancy is worth a lot of money per unit of effort.

---

## 1. Commercial shape — BLOCKING

**1.1 — Who is the buyer and who sits in front of the screen?**
- **A. B2B2C** — a broker/fund manager rebrands it for *their retail clients*. Needs tenant-scoped
  users, tenant-scoped auth, tenant-pays billing, per-tenant fund universes.
- **B. B2B internal** — an advisory firm's analysts use it in client meetings, branded so the
  screen-share and PDF look like their product. Needs seats, org wallet, branding.
- **C. Embedded/API** — they never see your UI; whitelabel collapses to API keys + usage billing.

→ **Recommend B first**, with the schema shaped so A is a migration, not a rewrite. Rationale: your
output artifacts (PDF export, on-screen frontier) are advisor-in-a-meeting artifacts. The onboarding
flow profiles *the user as an investor* (`user_profile.riskTolerance`, `experience`), which is a
professional modelling their own book — not a broker's customer. And B is the only option shippable
in weeks by one developer.

**1.2 — Is Fernando (the `sow.md` client) the first whitelabel customer, or is this a net-new
motion sold to strangers?**
→ **Recommend: assume Fernando or a Fernando-like design partner is customer #1.** Building a
self-serve tenant signup for a market of zero is the classic way to burn a quarter. If it's
net-new/self-serve, say so — it forces a public tenant-provisioning UI into scope.

**1.3 — How many tenants do you expect in 12 months? Pick the honest number.**
- 1–3 → per-tenant deploy (config in env vars) is *genuinely* the right call, and it's ~1 week.
- 4–15 → single deployment, row-level `organization_id`, branding in DB. ~4–6 weeks.
- 15+ → the above plus self-serve provisioning, tenant admin UI, per-tenant observability.

→ **Recommend: design for 4–15, ship the 1–3 path first**, i.e. add `organization_id` to the schema
now and scope every query by it even while each org has one member and each tenant gets its own
deploy. That is the cheap insurance; skipping it is the expensive mistake.

**1.4 — What does the tenant pay you, and does that replace or wrap the credit model?**
- Flat platform fee + they buy credits at wholesale and resell?
- Per-seat/month, credits included?
- Rev-share on their end users?

→ **Recommend: flat annual platform/licence fee + credits sold to the org wallet at a
volume-discounted rate.** It preserves the whole existing `credit_ledger` machinery, which is the
most finished part of the billing system, and avoids building invoicing/subscriptions (an explicit
`PAYMENTS.md` non-goal you'd otherwise have to reverse).

**1.5 — Is "whitelabel" (your brand fully invisible) or "powered-by" (co-branded)?** These are
different products and usually different prices. Powered-by is also a real marketing channel you'd
be giving away for free.
→ **Recommend: two tiers.** Co-branded ("Powered by Optim.") at the lower price; full whitelabel,
including no attribution in the PDF footer, at a premium.

---

## 2. Tenancy architecture — BLOCKING

**2.1 — One deployment for all tenants, or one deployment per tenant?**
- **Shared**: one Vercel + one Render + one Turso, tenant resolved from hostname. Cheap to operate,
  requires a rigorous `organization_id` on every query, and one bad `WHERE` clause leaks a client's
  portfolio to a competitor.
- **Isolated**: fork the infra per tenant. Zero leak risk, trivially supports per-tenant data
  residency, but N× the ops, N× the cost, and *N deploys per release*.

→ **Recommend: shared, with isolation available as an enterprise upsell.** Decisive reason from the
code: `funds`, `prices`, and `index_data` are **global** and populated from Yahoo. Isolated deploys
mean N× the Yahoo fetch cost and N× the storage of identical price history for no benefit. Shared
tenancy is what the data model already wants.

**2.2 — What's the tenant identity key: `organization_id` on every table, or a separate DB per
tenant (Turso supports cheap per-tenant DBs)?**
→ **Recommend a hybrid: `organization_id` columns in one DB.** Turso's per-tenant DB story is real,
but `db/index.ts` builds one client at module scope; making it per-request-tenant touches every
query path *and* breaks the shared price cache. Not worth it at this scale.

**2.3 — Which tables get `organization_id`?** My proposal — confirm or cut:
- **Yes**: `user` (nullable — a user belongs to at most one org), `simulations`, `user_profile`,
  `user_assumptions`, `user_correlations`, `background_tasks`, `wallet_balance`, `credit_ledger`,
  `payments`.
- **No (stay global)**: `funds`, `prices`, `index_data`, `fund_exposures`, `key_figures`,
  `credit_packages`.
- **New**: `organization`, `organization_member`, `organization_branding`, `organization_domain`.

**2.4 — Can one human belong to two orgs?** (An advisor consulting for two firms.)
→ **Recommend: no, for v1.** One user, one org, enforced by a unique constraint. Multi-org
membership means an org switcher in the UI, org context in every session, and it doubles the auth
surface. BetterAuth's own organization plugin does support it if you ever need it.

**2.5 — Should we adopt BetterAuth's official `organization` plugin instead of hand-rolling?**
→ **Recommend: yes, evaluate it first and default to adopting it.** It gives you orgs, members,
roles, invitations, and an active-org session field for free — all of which you'd otherwise write.
Cost: it owns its table shapes, so `schema.ts` gains tables you don't control, and it's another
migration to land. Needs a half-day spike before it's a decision. **This is the highest-leverage
unknown in the doc.**

**2.6 — What happens to the ~existing users when orgs land?** There are real rows in prod.
→ **Recommend: a "personal org" backfill** — every existing user gets an auto-created org of one,
so `organization_id` can be `NOT NULL` and there's exactly one code path instead of two. The
alternative (nullable, meaning "direct B2C user") means every query needs `OR organization_id IS
NULL` forever. Do the backfill.

**2.7 — Does the direct-to-consumer product continue to exist alongside whitelabel?** If yes, you're
running two products from one codebase and every feature question gets asked twice ("does the
tenant see the Academia? the advisor CTA? the crypto rail?").
→ **Recommend: yes it continues, but as "the org named Optim."** — i.e. the D2C product is
implemented as a tenant of the whitelabel system, not as a parallel path. Dogfooding the tenancy
layer is the only reliable way to keep it working.

---

## 3. Identity & auth

**3.1 — How does a user land in the right tenant?** By hostname (`acme.optim.app` /
`portfolios.acme.com`), by an invite link, or by email-domain matching?
→ **Recommend hostname as the primary resolution + invite links for joining.** Email-domain
matching (`@acme.com` → Acme) is a known account-takeover footgun on shared domains and with
personal addresses.

**3.2 — Custom domains, or subdomains of yours only?** Custom domains mean per-tenant DNS
verification, per-tenant TLS (Vercel handles issuance, you handle the UX), and cookie-domain
implications.
→ **Recommend: subdomain of yours in v1** (`acme.optim.app`), custom domain as a paid add-on later.
Custom domains are a surprising amount of support burden for a feature that looks like a checkbox.

**3.3 — This one is nastier than it looks: cookies.** `auth.ts` sets
`sameSite: "none", secure: true, partitioned: true` because web and API live on different origins.
With N tenant hostnames all talking to one API origin, is a single API origin still viable, or does
each tenant need its own API hostname for cookie scoping?
→ **Recommend: one API origin, keep `SameSite=None`, and add every tenant hostname to
`trustedOrigins` dynamically** (it's currently a static array literal — `auth.ts:75`). Verify
against Safari ITP + Chrome third-party-cookie deprecation before committing; `partitioned: true`
suggests you've already been bitten here once. **Needs a real browser test, not a code read.**

**3.4 — Whose OAuth apps?** Today there's one Google/GitHub/Microsoft client pair in env. On a
tenant's domain, the Google consent screen will say *your* app name — which visibly breaks the
whitelabel illusion at the single highest-stakes moment.
→ **Recommend: per-tenant OAuth credentials, stored on the org row, encrypted.** `auth.ts:50`
builds `socialProviders` once at module scope from env, so this is a real refactor to
per-request/per-tenant provider config. If that proves ugly, the fallback is
**email+password only for whitelabel tenants** — which is honestly acceptable for B2B internal
(§1.1 option B) and saves a lot of work. Your call on which.

**3.5 — SSO (SAML/OIDC) — needed for v1?** Any B2B buyer above ~50 seats will ask.
→ **Recommend: explicitly out of scope for v1**, but note it in the spec as the known enterprise
gate so it isn't a surprise in a sales call.

**3.6 — Roles within an org?** (owner / admin / analyst / read-only)
→ **Recommend two roles: `owner` and `member`.** Owner manages branding, seats, and the wallet;
member uses the app. Anything finer is speculative until a customer asks.

**3.7 — Who can see whose simulations inside an org?** Today `simulations` is strictly per-user.
Analysts at a firm will absolutely expect to share a portfolio with a colleague.
→ **Recommend: private by default, with an explicit "share with my organization" flag on the
simulation row.** It's one boolean and one `OR` in the list query, and it pre-empts the first
feature request every B2B customer will make.

---

## 4. Billing — BLOCKING (this contradicts `PAYMENTS.md`)

**4.1 — Org wallet or per-user wallets inside an org?** `wallet_balance` is PK'd on `user_id`
(`schema.ts:222`), so this is a schema change either way.
→ **Recommend: org-level wallet, per-user attribution in the ledger.** The org buys 10,000 credits;
`credit_ledger` still records which user spent each one, so the owner gets a per-analyst usage
report for free. Change `wallet_balance` PK to `organization_id`; keep `credit_ledger.user_id`.

**4.2 — Do tenant end users ever see Stripe?** In whitelabel B2B2C, a retail user hitting *your*
Stripe checkout with your business name on the card statement destroys the illusion and creates a
merchant-of-record problem.
→ **Recommend: tenants' users never transact. The org pre-purchases credits; end users just spend
from the org pool.** This sidesteps merchant-of-record, per-tenant Stripe Connect, and per-tenant
tax handling — all of which are quarters of work, not weeks.

**4.3 — Does the org owner need per-seat credit limits?** ("Junior analysts get 200/month.")
→ **Recommend: out of scope for v1, but flagged in the spec.** It's a real request but it needs
period accounting (monthly reset), which the append-only ledger doesn't currently model.

**4.4 — What happens when an org runs out of credits mid-meeting?** Today a user gets a 402 and a
"buy credits" CTA — pointing at *your* Stripe. For an analyst mid-client-meeting that's the worst
possible failure.
→ **Recommend: org-level negative-balance tolerance (an overdraft up to a configured limit) plus a
low-balance email to the owner at 20%.** Never hard-block a paying enterprise tenant in front of
their own client.

**4.5 — Is the crypto rail (Coinbase Commerce) exposed to whitelabel tenants at all?**
→ **Recommend: no — hide it for org-billed tenants.** A corporate finance department pays by card
or invoice. Keep it for D2C.

**4.6 — Invoicing.** Enterprises pay on net-30 POs, not by card. Does v1 support "we sent an
invoice, mark 10,000 credits as granted"?
→ **Recommend: yes, but manually** — an admin-only "grant credits" action writing a
`reason: 'grant'` ledger row. The ledger already supports `grant` (`PAYMENTS.md` §3). No invoicing
system, no automation. One endpoint, one afternoon.

---

## 5. What's actually skinnable — and what quietly isn't

**5.1 — Logo.** There is **no logo asset anywhere** — the brand is text (`Brand.shortName` +
`Brand.fullName`) styled with a gold gradient. So "upload your logo" is a genuinely *new* feature,
not a swap. Do tenants get an image logo, wordmark text, or both?
→ **Recommend: both, image preferred.** SVG or PNG upload, plus a text fallback, plus a favicon.
Requires blob storage — see 5.9.

**5.2 — Colour.** `globals.css` is disciplined enough that a tenant palette is a real possibility.
But how much control?
- **A. Accent only** — tenant sets `--primary` and the gold gradient stops; everything else stays.
- **B. Full palette** — tenant sets all ~40 tokens.
- **C. Curated presets** — pick from 5 pre-designed themes.

→ **Recommend A, hard.** Full palette control means the tenant can and will produce an unreadable
app, and every support ticket becomes a contrast-ratio debate you can't win. Accent-only keeps your
design intact while feeling meaningfully theirs. Also: the accent is load-bearing across
`--primary`, `--primary-emphasis`, `--ring`, `--gradient-gold-from/to`, `--glow-strong`,
`--glow-soft` — one input needs to derive all of them.

**5.3 — Do we validate tenant colours for accessibility?** A tenant whose brand is pale yellow
will produce unreadable primary buttons on the light theme.
→ **Recommend: yes — compute contrast against `--background` in both themes and auto-adjust
lightness to hit 4.5:1**, rather than rejecting the colour. Same trick `--primary-emphasis` already
uses ("moves *away* from the page in each theme").

**5.4 — Charts.** `chart-theme.tsx` returns **hex literals** and the comment is explicit that they
can't be CSS vars, because call sites do `${color}55`. Tenant-themed charts therefore mean either
(a) refactoring every alpha concatenation to a proper colour function, or (b) computing the hex set
per tenant at runtime.
→ **Recommend (b): generate the palette per tenant from the accent, in JS, keeping hex output.**
Cheaper and doesn't touch the ~15 chart components. But **the tenant accent must not collide with
the semantic colours** — `optimal` is gold, `danger` is red, gain/loss are green/red by CLAUDE.md
rule. A tenant with a red brand gets a chart where "your portfolio" looks like "you lost money".
How do we handle that? → *Recommend: semantic colours are never tenant-configurable, and the accent
is nudged out of the red hue range if it collides.*

**5.4b — The PDF is a third colour system.** `simulation-pdf.ts:22-29` declares its own 8 hex
constants (`COLOR_GOLD`, `COLOR_BACKGROUND`, …), dark-only, sharing nothing with `globals.css` or
`chart-theme.tsx`. So "tenant accent" has to be plumbed into **three** independent palettes, and the
PDF one also has no light variant — a tenant on a light brand gets a black-background PDF.
→ **Recommend: one `deriveTenantPalette(accent)` function as the single source, consumed by all
three** (CSS var injection, chart hex set, PDF constants). Also worth asking separately: **should
the PDF get a light/paper variant?** A dark-background PDF is a deliberate style choice for your
brand, but it costs a tenant real money in toner when their client prints it, and it reads as
"someone else's template" more than any other surface.

**5.5 — Fonts.** Hardcoded at module scope in `layout.tsx` via `next/font/google` — that API
requires literal, statically-analysable arguments, so a *runtime* per-tenant font is not possible
with the current setup.
→ **Recommend: offer a fixed menu of ~6 pre-imported Google fonts**, selected per tenant via a CSS
variable class. Arbitrary font upload means self-hosting woff2s and a foundry-licensing question
you don't want.

**5.6 — Product name.** `Brand.*` lives in the i18n message files, which are static JSON compiled
into the bundle — so a per-tenant name means moving `Brand` out of static messages into
runtime-injected values.
→ **Recommend: hoist `Brand.*` and `Metadata.*` out of the message files into a tenant config
object provided by a server component and threaded through the existing `NextIntlClientProvider`
as runtime values.** This is the single most invasive branding change; it's also unavoidable.

**5.7 — Which surfaces must be branded?** Rank these, because each has a different cost:
| Surface | Cost | My call |
| --- | --- | --- |
| Sidebar / header wordmark | Low | v1 |
| Browser tab title + favicon | Low | v1 |
| PDF export header/footer | Medium (`components/pdf/`) | **v1 — it's the artifact that leaves the building** |
| Auth screens | Low | v1 |
| Transactional email (verify, reset) | Medium — see §6 | v1 |
| Scheduled-simulation email (`CRON.md`) | Medium | v1 if that ships |
| Onboarding flow | Low | v1 |
| Academia (5 stations + 3D globe) | High | **Defer — see 7.3** |
| Mobile app | Very high — see §8 | Defer |

**5.8 — The 3D globe** (`academia/ZoomGlobe.tsx`) is a "deliberately dark cinematic stage in both
themes" per CLAUDE.md. Does it stay dark-and-yours for every tenant, or get tinted?
→ **Recommend: stays as-is, untinted.** It's a scene, not chrome; the `--scene-*` tokens already
justify it. Tinting a cinematic render by an arbitrary brand colour will look broken more often
than not.

**5.9 — Where do logo uploads live?** There's no blob storage in the stack today (Turso, Render,
Vercel — no S3/R2 anywhere).
→ **Recommend: Vercel Blob** — least new infra given you're already on Vercel. Alternative for v1
with 1–3 tenants: **commit the assets to the repo** and skip storage entirely. Honestly viable and
I'd take it for the first customer.

**5.10 — Can tenants override copy beyond the brand name?** ("Call them 'analyses', not
'simulations'." "Don't say 'créditos', say 'tokens'.")
→ **Recommend: no arbitrary overrides; a small allowlist** (`Brand.*`, the credit noun, the advisor
CTA block). A general per-tenant translation-override layer is a maintenance tax on every future
string you add.

---

## 6. Email, domains, deliverability

**6.1 — Do tenant emails come from the tenant's domain?** Today: one `EMAIL_FROM`. A "verify your
email" from `Optim <onboarding@resend.dev>` on Acme's branded app is jarring and lands in spam.
→ **Recommend: per-tenant `from` on a subdomain you control** (`acme@mail.optim.app`) for v1 —
one verified sending domain, no tenant DNS work. Full custom sending domains (tenant adds SPF/DKIM
records) as an enterprise add-on.

**6.2 — Which emails need tenant branding?** Only `VerifyEmail` and `ResetPassword` exist today;
`CRON.md` adds scheduled-simulation delivery.
→ **Recommend: all of them, driven by the same tenant config as the web app.** They're React Email
components; threading a branding prop through is cheap. Do it when the templates are touched, not
as a separate pass.

**6.3 — Email is also where the whitelabel illusion is most legally exposed.** If Acme's user gets
a password-reset email, whose privacy policy and support address does the footer point to?
→ **Recommend: tenant-configurable support email + privacy-policy URL, required fields at
provisioning.** Cheap to build, and it's the thing a compliance reviewer checks first.

---

## 7. Product scope per tenant

**7.1 — Fund universe.** Ticker search hits Yahoo live and returns *any* EQUITY/ETF worldwide
(`historical/routes.ts:22`). An Argentine broker will want their curated instrument list — partly
for UX, partly because recommending an instrument they can't execute is a compliance problem.
→ **Recommend: optional per-tenant allowlist.** Empty = full Yahoo search (today's behaviour);
populated = search filtered to that list. Small change, high perceived value, real compliance
value.

**7.2 — Can tenants upload their *own* instruments** (private funds with no Yahoo ticker — exactly
what `funds.portfolio_code` and `fund_exposures` smell like they were built for)?
→ **Recommend: yes, and this may be the actual killer feature.** A fund manager wants *their* funds
in the optimizer, not just SPY. But it means per-tenant rows in the currently-global `funds`/
`prices` tables, plus a price-upload path. **Meaningful scope — flag it as a phase 2 headline
rather than sneaking it into v1.**

**7.3 — Academia.** Five hand-authored educational stations, heavily voiced, plus a 3D globe. Does
a tenant get it, and can they edit it?
→ **Recommend: a per-tenant on/off toggle, no editing.** Editing means a CMS. Many B2B tenants will
want it *off* (their analysts don't need a Markowitz tutorial) — and "off" is free to build.

**7.4 — The advisor CTA is a genuine problem.** It books a call with "**nuestro** asesor
financiero" via your Cal.com, for 100 credits. On Acme's whitelabel app this means Acme's users are
being routed to *your* advisor — a channel-conflict and, in most jurisdictions, a licensing issue.
→ **Recommend: per-tenant setting with three states — off (default for whitelabel), your advisor,
or the tenant's own booking URL.** `ADVISOR_BOOKING_URL` moves from env to the org row. **Do not
ship whitelabel with this defaulting on.**

**7.5 — Scheduled simulations (`CRON.md`).** One Vercel cron on Hobby, ±59min precision, one tick
per day. Per-tenant sending at that precision, with per-tenant branding, from a shared cron.
→ **Recommend: works as-is** — the daily tick just fans out per-org — **but the Hobby one-cron-per-
day limit becomes a real constraint** the moment a tenant asks for "Monday 8am *their* time" across
timezones. Note the limitation in the spec; the fix is a Vercel Pro plan, not code.

**7.6 — Does a tenant get an admin view of their users' activity?** (Usage per analyst, simulations
run, credits burned.)
→ **Recommend: yes, minimal — one page.** It's mostly `credit_ledger` grouped by user, it's the
main thing an org owner logs in for, and it justifies the platform fee.

---

## 8. Mobile — BLOCKING for scope

**8.1 — Does whitelabel include the Expo app?** Real whitelabel mobile means either N App Store
listings under the *tenant's* developer account (a per-tenant release pipeline, per-tenant review
cycles, per-tenant OAuth redirect schemes — the deep-link scheme is compiled in via `app.json`, per
the memory note on the prebuild gotcha) or a single app that re-skins after login.
→ **Recommend: explicitly out of scope, stated loudly in the spec.** Whitelabel mobile is a bigger
project than whitelabel web, and per your own `TODO.md` the mobile app is a ~25–30% subset of web.
If a tenant needs mobile, the answer is the responsive web app.

**8.2 — If a tenant's user signs in on the shared mobile app, what do they see?**
→ **Recommend: works, unbranded, with their org's data and wallet.** Correct data isolation, no
theming. One sentence in the spec, near-zero work.

---

## 9. Provisioning & operations

**9.1 — How does a tenant get created?** Self-serve signup, or you run a script?
→ **Recommend: an internal admin script/CLI for v1.** At 1–5 tenants a self-serve provisioning UI
is pure waste. It also lets you keep the sales conversation.

**9.2 — Who edits branding after provisioning — you or the tenant owner?**
→ **Recommend: tenant owner, via a settings page.** This is the difference between "a product" and
"a consulting deliverable", and it's the single highest ratio of perceived value to build cost in
this whole document. Roughly one page and one endpoint.

**9.3 — How is branding delivered to the browser without a flash of *your* brand?** Same class of
problem `THEME_INIT_SCRIPT` already solves for dark mode.
→ **Recommend: resolve the tenant in `middleware.ts` from the `Host` header** (this file doesn't
exist yet — it's net-new), **inject branding into the root layout server-side, and emit the tenant
palette as an inline `<style>` overriding `:root`.** No flash, no client fetch. This is the
cleanest single design decision in the whole feature and I'd build it first.

**9.4 — Caching.** Next.js caches aggressively and the app is currently host-agnostic. Every cached
page and every `fetch` becomes tenant-sensitive overnight — a cache leak here serves Acme's
branding, or worse Acme's *data*, to Beta Corp.
→ **Recommend: `Vary: Host` on tenant-scoped responses, tenant ID in every cache key, and an
explicit test for cross-tenant cache bleed.** **This is the most likely way this feature causes a
production incident.** It needs its own section in the spec, not a bullet.

**9.5 — How do we test tenant isolation?** A single missing `WHERE organization_id = ?` leaks a
client portfolio to a competitor.
→ **Recommend: a mandatory integration test per scoped endpoint** — two orgs, assert org A cannot
read/write/enumerate org B — and a repo convention that a new scoped table lands with its isolation
test in the same commit. Nothing else reliably prevents this class of bug.

**9.6 — Observability per tenant.** When Acme says "it's slow", can you answer?
→ **Recommend: tenant ID on every log line and error report.** Cheap now, impossible to retrofit
under pressure.

**9.7 — Data export / offboarding.** A departing tenant will ask for their data. Contracts often
require it.
→ **Recommend: a JSON dump endpoint (org-scoped), admin-triggered.** ~Half a day. Not having an
answer during contract review is worse than the build cost.

---

## 10. Legal & compliance

**10.1 — Who's liable for the advice?** The app outputs portfolio allocations. Under a tenant's
brand, *their* client sees *their* logo on a recommendation your optimizer produced.
→ **Recommend: mandatory, non-removable disclaimer** — tenant-editable in wording, but presence is
not optional, and it appears in the app *and* the PDF export. This one is worth a real lawyer's
30 minutes before the spec is signed, not just my recommendation. **Flagging as the highest
non-technical risk in this document.**

**10.2 — Regulated tenants.** An Argentine broker under CNV, or anyone under MiFID II, may face
requirements around record-keeping and suitability that the app doesn't currently meet.
→ **Recommend: state explicitly in the spec that the platform is a decision-support tool and
regulatory compliance is the tenant's responsibility**, mirroring `sow.md`'s "not a trading tool"
framing. Get it into the contract, not just the docs.

**10.3 — Data residency.** An EU tenant may require EU-hosted data. Turso supports regional
replicas; a shared DB does not partition by region.
→ **Recommend: out of scope for v1; isolated deployment (§2.1) is the answer if it ever comes up.**

**10.4 — Whose privacy policy and ToS does a tenant's end user accept?**
→ **Recommend: tenant-supplied URLs, required at provisioning** (same fields as 6.3), plus a
back-to-back clause in your tenant contract.

---

## 11. Sequencing — my proposed phases (argue with these)

**Phase 0 — Schema, no visible change.** `organization` + `organization_member` tables,
`organization_id` on scoped tables, personal-org backfill (2.6), every query scoped, isolation tests
(9.5). *Nothing ships to users. This is the load-bearing phase and the one most likely to get cut
under pressure — don't.*

**Phase 1 — Branding.** `middleware.ts` host resolution, tenant config in the root layout, accent
palette + derived chart hexes, wordmark/logo/favicon, PDF and email branding, tenant settings page.

**Phase 2 — Org billing.** Wallet moves to org, ledger keeps user attribution, admin grant endpoint,
usage-per-analyst view, low-balance emails, overdraft tolerance.

**Phase 3 — Tenant product controls.** Fund allowlist, Academia toggle, advisor CTA config,
org-shared simulations.

**Phase 4 (separate project, not this spec).** Tenant-uploaded instruments (7.2), custom domains,
per-tenant OAuth, SSO.

**11.1 — Is Phase 0 acceptable as a release with zero user-visible change?** If not, we merge 0 and
1, which is riskier but demoable.
→ **Recommend: keep them separate.** A schema migration and a visual overhaul failing together is
much harder to debug than either failing alone.

---

## 12. Things I'll assume unless you say otherwise

1. Spanish stays the default locale for all tenants; per-tenant default locale is configurable but
   the language set stays `es`/`en`.
2. Tenants do not get access to the raw API — no per-tenant API keys in v1 (that's §1.1 option C,
   a different product).
3. No per-tenant feature flags beyond the specific toggles named in §7.
4. `credit_packages` stays global; per-tenant pricing is handled by the contract, not the code.
5. The D2C product keeps its current URL and brand and becomes tenant #1 (2.7).
6. No tenant-facing SLA is being committed to.
7. Existing simulations, wallets, and ledger rows migrate into personal orgs with zero data loss and
   zero user-visible change.

---

## 13. My honest read

Three things stand out from the code:

**The colour system is *mostly* ready and the tenancy layer doesn't exist.** `globals.css` is
disciplined — "never hardcode a colour" was clearly enforced in the app chrome — so re-skinning the
UI is genuinely about a week. The caveat is that there are really **three** palettes (CSS tokens,
chart hexes, PDF constants) and only the first one obeys the rule. Meanwhile
`schema.ts` has no tenancy concept whatsoever, and `PAYMENTS.md` explicitly rules out org wallets.
So the *visible* half of whitelabel is cheap and the *invisible* half is most of the project. Any
plan that sequences the cheap visible part first will look like it's 80% done when it's 20% done.

**The advisor CTA (7.4) has to be handled before the first tenant demo,** not after. Routing a
tenant's clients to your financial advisor is the kind of detail that ends a sales conversation.

**Cross-tenant cache bleed (9.4) is the incident waiting to happen.** Next.js caching plus a
suddenly host-sensitive app plus financial data is exactly the combination that produces the bad
kind of postmortem. It deserves explicit design, not a bullet in a checklist.

And the question under all the others: **§1.3 — how many tenants, honestly?** At three, most of
this document is over-engineering and per-tenant deploys plus a config file would be the right
answer. At fifteen, everything here is necessary. That number determines whether this is a
two-week job or a two-month one.
