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
  Sharpe, 1Y/2Y loss probability, and an allocation table). Deferred to later:
  date-range picker, leverage / max-weight constraints, efficient-frontier and
  chart visualizations, and a credits-specific (402) message.
- Persist the user's locale choice and add a locale switcher

## CI / tooling
- [x] Add ESLint configs for apps/api (typescript-eslint flat config) and
  apps/web (eslint-config-next via .eslintrc.json, pinned to ESLint 8 since
  eslint-config-next@14 is incompatible with ESLint 9). CI `lint` job now runs
  `pnpm lint` across the whole monorepo (api + web + mobile).
- [x] Add vitest tests for apps/api (src/lib/dates) and apps/web (src/lib/utils).
  The `test` script now runs `vitest run` (deterministic, no watch hang in CI);
  `test:watch` was added for local watch mode.

