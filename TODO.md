# TODO

Cobros (USDC, USDT, too)
Planilla con costos (done, need to be sent to the client)
Email flows (wired with Resend; need to set RESEND_API_KEY in apps/api/.env and on Render, plus verify a sending domain in Resend so EMAIL_FROM can move off onboarding@resend.dev)
Implement EODHD

## Mobile app (apps/mobile)
- [x] Wire BetterAuth sign-in (Google / GitHub / Microsoft) to unlock the
  optimizer. Uses the `@better-auth/expo` plugin (server + client): social
  sign-in opens the system browser and redirects back via the
  `portfoliooptimization://` scheme; the session token is stored in
  expo-secure-store and replayed as a Cookie header on API calls. The optimizer
  tab is gated behind the session. Requires OAuth client IDs/secrets and the
  app's redirect URI registered with each provider.
- [x] Build out the optimizer flow against POST /api/optimization/optimize.
  Optimizer tab now has a working form: ticker search (debounced, via
  /api/historical/search) with chips, the 6 strategies, conditional
  risk-free-rate / target-return / target-risk inputs, full-investment and
  short-selling toggles, then renders results (expected return, volatility,
  Sharpe, 1Y/2Y loss probability, and an allocation table). The credits-specific
  (402) message now ships with the billing work below. Deferred to later:
  date-range picker, leverage / max-weight constraints, and efficient-frontier /
  chart visualizations.
- [x] Persist the user's locale choice and add a locale switcher. A
  `LocaleProvider` holds the active locale in React state (so `useTranslations`
  re-renders all consumers); the choice persists via expo-secure-store and
  hydrates on launch, falling back to the device locale. An ES/EN
  `LocaleSwitcher` lives in the tab header (`headerRight`), so it's reachable
  from every tab without a drawer.

## Mobile parity (web → mobile gaps)

The mobile app is currently a thin subset of web (~25–30%): social auth, a basic
optimizer, and the locale switcher. Ordered by priority:

- [x] Billing / credits on mobile (`/api/billing/*`). New "Credits" tab gated
  behind the session: `WalletCard` (balance via `GET /billing/wallet`),
  `PackagePicker` (Card/Crypto rail tabs → `GET /billing/packages?rail=`, then
  `POST /billing/checkout` or `/billing/crypto/checkout`, opening the hosted
  Stripe/Coinbase flow in `expo-web-browser` and refetching on return), and a
  paginated `LedgerList` (`GET /billing/ledger`). The optimizer header shows a
  `CreditsChip`; a successful run refetches the balance, and a 402 surfaces an
  "Out of credits → Buy credits" prompt instead of the generic error. Hooks in
  `src/hooks/use-billing.ts`, API in `src/lib/api/billing.ts`.
- [x] Financial advisor booking on mobile (`POST /api/billing/advisor-call`).
  `AdvisorCta` card in the optimizer results books the call (with an
  idempotency key), opens the Cal.com booking page in `expo-web-browser`, and
  routes a 402 to the credits tab.
- Align auth across clients. Web's UI only does email/password; mobile only does
  social — so accounts created on one client can't sign in on the other. Add
  email/password sign-in (+ verify email, password reset) to mobile and/or
  social buttons to web.
- [x] Saved optimizations / history on mobile (`/api/simulations`): list, view,
  rename, pin, rerun, delete. New "History" tab (session-gated) lists saved runs
  (pinned first, then newest) with per-row pin/unpin, re-run, and delete (with a
  confirm); pull-to-refresh. Tapping a row opens a stack detail route
  (`app/simulation/[id].tsx`) with inline rename, re-run-with-latest-data, and
  the full results table. The optimizer is no longer fire-and-forget: results
  now show a "Save to history" action (`SaveToHistory`) that persists the run
  and links to its detail. API in `src/lib/api/simulations.ts`, hooks in
  `src/hooks/use-simulations.ts` (optimistic pin, rerun = re-optimize + PUT).
  Cross-client note: web-created runs display/pin/rename/delete fine; re-running
  one from mobile recomputes with default rates since the param shapes differ.
- Onboarding wizard on mobile (`/api/onboarding`): localization, investor
  profile, market preferences — web gates the app behind this.
- Richer optimizer results on mobile: charts (efficient frontier, weights bar,
  cumulative returns, asset & rolling volatility) and the user-vs-optimal
  comparison; plus date-range, leverage, and per-asset w_max form inputs.
- Academia / education stations on mobile.

## CI / tooling
- [x] Add ESLint configs for apps/api (typescript-eslint flat config) and
  apps/web (eslint-config-next via .eslintrc.json, pinned to ESLint 8 since
  eslint-config-next@14 is incompatible with ESLint 9). CI `lint` job now runs
  `pnpm lint` across the whole monorepo (api + web + mobile).
- [x] Add vitest tests for apps/api (src/lib/dates) and apps/web (src/lib/utils).
  The `test` script now runs `vitest run` (deterministic, no watch hang in CI);
  `test:watch` was added for local watch mode.

