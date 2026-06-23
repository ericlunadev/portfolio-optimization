# TODO

Cobros (USDC, USDT, too)
Planilla con costos (done, need to be sent to the client)
Email flows (wired with Resend; need to set RESEND_API_KEY in apps/api/.env and on Render, plus verify a sending domain in Resend so EMAIL_FROM can move off onboarding@resend.dev)
Implement EODHD

## Mobile app (apps/mobile)
- Wire BetterAuth sign-in (Google / GitHub / Microsoft) to unlock the optimizer
- Build out the optimizer flow against POST /api/optimization/optimize
- Persist the user's locale choice and add a locale switcher

## CI / tooling
- [x] Add ESLint configs for apps/api (typescript-eslint flat config) and
  apps/web (eslint-config-next via .eslintrc.json, pinned to ESLint 8 since
  eslint-config-next@14 is incompatible with ESLint 9). CI `lint` job now runs
  `pnpm lint` across the whole monorepo (api + web + mobile).
- [x] Add vitest tests for apps/api (src/lib/dates) and apps/web (src/lib/utils).
  The `test` script now runs `vitest run` (deterministic, no watch hang in CI);
  `test:watch` was added for local watch mode.

