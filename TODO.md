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
- Add ESLint configs for apps/api and apps/web (neither is currently linted),
  then switch the CI `lint` job from `pnpm --filter=mobile lint` to `pnpm lint`
  so the whole monorepo is covered
- Add tests (vitest) for apps/api and apps/web; the CI test step already runs
  them (currently passes with --passWithNoTests)

