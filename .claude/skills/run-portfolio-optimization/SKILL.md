---
name: run-portfolio-optimization
description: Run, start, and drive the portfolio-optimization web app + API locally with three whitelabel tenants on separate hostnames. Use when asked to run the app, start the dev stack, log in as a tenant, take screenshots of the UI or a tenant's branding, run an optimization end to end, or check what a change looks like in the running app. Covers apps/web and apps/api together; not apps/mobile.
---

Launches the Next.js web app (`apps/web`, :3000) and the Hono API (`apps/api`, :8001) against a
throwaway SQLite database seeded with three tenants, then drives the browser with
**`agent-browser`**. The one driver is `.claude/skills/run-portfolio-optimization/run.sh`; it
does the dozen setup steps a fresh checkout needs and never touches a real database.

All paths are relative to the repo root. Verified on macOS (Darwin, Apple Silicon).

| tenant | URL | tier | accent | analyst (password `demo-password-123`) | header when signed in |
| --- | --- | --- | --- | --- | --- |
| `d2c` | http://localhost:3000 | co-branded, default | gold `#d7a042` | `analista@d2c.example` | Martín Gómez |
| `acme` | http://acme.localhost:3000 | whitelabel | teal `#0f766e` | `analyst@acme.example` | Lucía Fernández |
| `borealis` | http://borealis.localhost:3000 | co-branded | indigo `#4338ca` | `analyst@borealis.example` | Noah Lindqvist |

Each analyst owns their tenant, has finished onboarding, and has 250 credits.

## Prerequisites

`pnpm`, Node 22, the `sqlite3` CLI, `lsof`, `curl`, and `agent-browser` on `PATH`. Chromium
resolves `*.localhost` to loopback, so no `/etc/hosts` edits are needed.

```bash
pnpm install --frozen-lockfile
```

## Run (agent path)

```bash
bash .claude/skills/run-portfolio-optimization/run.sh up
```

`up` stops anything on :3000/:8001, creates a fresh database in
`${TMPDIR:-/tmp}/portfolio-optimization-demo/` (override with `DEMO_DIR=`), migrates it, seeds
the default tenant, provisions `acme` and `borealis` through the real `provision:tenant` CLI,
starts the API, signs up and places one analyst per tenant, starts the web app, and waits for
both. Takes about a minute. Logs: `$DEMO_DIR/api.log`, `$DEMO_DIR/web.log`.

```bash
bash .claude/skills/run-portfolio-optimization/run.sh status
```

Prints API health, which organization each hostname resolves to, and the web app's HTTP status.

**Sign in through the form** — works on all three hostnames. **Set a tall viewport first and run
one command at a time** (see Gotchas):

```bash
agent-browser --session acme set viewport 1440 3200
agent-browser --session acme open http://acme.localhost:3000
agent-browser --session acme find role button click --name "Iniciar Sesión"
agent-browser --session acme snapshot -i -c
```

The modal has its own "Iniciar Sesión" button besides the header's, so take the refs from the
snapshot: fill the "Correo electrónico" and "Contraseña" textboxes, then click the modal's button.
The refs below are the ones the modal had on all three hostnames; re-snapshot if they don't match.

```bash
agent-browser --session acme fill @e22 "analyst@acme.example"
agent-browser --session acme fill @e23 "demo-password-123"
agent-browser --session acme click @e24
agent-browser --session acme wait --text "Lucía Fernández"
```

**Shortcut when sign-in itself is not what you are checking** (the session is named after the
tenant; it signs in server-side — see Gotchas):

```bash
bash .claude/skills/run-portfolio-optimization/run.sh login acme
```

Then drive it:

```bash
agent-browser --session acme set viewport 1440 3200
agent-browser --session acme open http://acme.localhost:3000/billing
agent-browser --session acme wait --text "Uso por miembro"
bash .claude/skills/run-portfolio-optimization/run.sh shot acme acme-billing
```

**Run a real optimization** (calls Yahoo Finance live, so it needs network; spends 2 credits):

```bash
bash .claude/skills/run-portfolio-optimization/run.sh login borealis
agent-browser --session borealis set viewport 1440 3200
agent-browser --session borealis open "http://borealis.localhost:3000/efficient-frontier/new?assets=SPY%7E%2CGLD%7E%2CTLT%7E"
agent-browser --session borealis wait --text "Siguiente"
agent-browser --session borealis find role button click --name "Siguiente"
agent-browser --session borealis wait --text "Pesos del Portafolio"
bash .claude/skills/run-portfolio-optimization/run.sh calls
bash .claude/skills/run-portfolio-optimization/run.sh shot borealis borealis-results
```

The `?assets=` URL only pre-fills the form; clicking "Siguiente" runs it. `run.sh calls` lists
the writes the API actually received, so a `POST /api/optimization/optimize 200` line proves the
click submitted. `run.sh shot <session> <name>` saves to `$DEMO_DIR/shots/<name>.png` and prints
the path.

**Look at every screenshot.** A logged-out page, or a form where results were expected, means a
step silently failed.

```bash
bash .claude/skills/run-portfolio-optimization/run.sh stop
```

## Run (human path)

After `run.sh up`, open the three URLs above in any Chromium-based browser and sign in through
the header's "Iniciar Sesión" button with the analyst for that hostname.

## Test

```bash
pnpm --filter api test
pnpm --filter web test
```

At the time of writing: 313 API tests across 24 files and 366 web tests across 18 files.

## Gotchas

- **Clicks below the fold silently miss.** The app's `<main>` is its own scroll container.
  `agent-browser` reports `✓ Done` for a click on an element beyond the viewport, but nothing
  happens. Proven on this app: "Siguiente" did nothing at the default viewport and submitted
  at 1440×3200. `agent-browser scroll` and `hover` don't scroll that container, and
  `screenshot --full` is clipped to the viewport. Set a tall viewport before clicking or taking
  full-page screenshots.
- **Never run two `agent-browser` commands at once on the same session.** A long `wait` plus
  anything else in parallel produces `Resource temporarily unavailable (os error 35)`. It then
  leaves the session's daemon hung: `get url` and `close` hang, and it ignores SIGTERM. Recovery
  is in Troubleshooting.
- **A hostname can sign in only if it has an `organization_domain` row.** The API trusts
  `FRONTEND_URL` plus each registered hostname, for both BetterAuth's origin check and CORS
  (`apps/api/src/lib/trusted-origins.ts`). Any other `Origin` — including lookalikes such as
  `evil-acme.localhost` — gets **403** from `POST /api/auth/sign-in/email`, and `api.log` shows
  `[Better Auth]: Invalid origin: <origin>`. The API caches the hostname list for 10 s: a row
  inserted into the running database with `sqlite3` answered 403 immediately and 200 eleven
  seconds later, with no restart.
- **`run.sh login` cannot tell you whether sign-in works.** It signs in with `curl` and no
  `Origin` header, which BetterAuth does not check, then hands the cookie to `agent-browser`. Use
  it to get to a page quickly; use the form when auth is what changed. Run it again after every
  `up`, which wipes the database.
- **Branding follows the hostname, not the login.** Any hostname without an
  `organization_domain` row renders the default D2C tenant. To check what an arbitrary host
  resolves to without a browser: `curl -s "http://localhost:8001/api/tenants/by-host?host=acme.localhost"`.
  For server-rendered HTML per tenant, send the host header:
  `curl -s -H "Host: acme.localhost:3000" http://localhost:3000/`.
- **`provision:tenant` only accepts `*.optim.app` hostnames** (decision D6), and it cannot add
  members (PLAN.md Task 0.9). `run.sh` provisions with `*.optim.app` and then rewrites the
  domain rows to `*.localhost`. It adds each analyst by moving the membership its signup
  created (one user, one org — decision D3).
- **`pnpm --filter api dev` fails in a fresh checkout** with `node: .env: not found`: the
  script passes `--env-file=.env` and no `.env` is committed. `run.sh` runs `tsx` directly with
  the environment inline.
- **`drizzle.config.ts` falls back to `file:portfolio.db`** when `DATABASE_URL` is unset, so a
  bare `pnpm db:migrate` targets `apps/api/portfolio.db`. `run.sh` always passes the scratch
  database explicitly.
- **Signup still returns 200 without `RESEND_API_KEY`.** The verification email fails and
  `api.log` shows a Resend stack trace. That's expected here; `run.sh` marks analysts verified.
- **Next dev logs `Cross origin request detected from acme.localhost to /_next/* resource`.**
  It's only a warning on Next 14.2; pages still hydrate and work.
- **Billing shows "Aún no hay paquetes disponibles".** No credit packages are seeded; top-ups in
  this setup come from the ledger grants `run.sh` writes.

## Troubleshooting

- **`✗ Failed to read: Resource temporarily unavailable (os error 35)`, then the session hangs**:
  two commands ran concurrently on one session. `close` won't work and SIGTERM is ignored, so
  force-kill that session's daemon and sign in again:
  `kill -9 "$(cat ~/.agent-browser/<session>.pid)"`, then `run.sh login <session>`.
- **A click prints `✓ Done` but the page doesn't change**: the element is below the fold inside
  `<main>`. `agent-browser --session <s> set viewport 1440 3200`, then click again.
- **The results page never appears after "Siguiente"**: run `run.sh calls`. No line means the click missed (previous item). A line with a non-200
  status means the optimizer or Yahoo failed, so read the rest of `api.log`.
- **`✗ API :8001 did not come up` / `✗ web :3000 did not come up`**: read `$DEMO_DIR/api.log` or
  `$DEMO_DIR/web.log`. `up` frees both ports first, but a process owned by another user can
  still hold them: `lsof -nP -iTCP:3000 -iTCP:8001 -sTCP:LISTEN`.
