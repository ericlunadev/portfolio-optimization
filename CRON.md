# Scheduled Simulations by Email

Recurring re-runs of saved simulations, delivered by email.

Each run replays a saved simulation's stored params with the end date moved forward to
today, so the user sees how their portfolio's optimal weights drift as new market data
arrives.

---

## 1. Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Scheduler | **Vercel Cron** on the Next.js app | Free on Hobby; Render cron jobs cost $1/mo minimum each and free Render web services spin down after 15 min idle, so an in-process timer is unreliable. |
| Cadence granularity | daily / weekly / monthly | Vercel Hobby allows **one cron per day**. A single daily tick plus a `next_run_at` due-check covers all three. Intraday cadences are out of scope. |
| End date per run | **Last day of the current month** | Byte-for-byte identical to `useRerunSimulation`, so scheduled and manual re-runs can never diverge. |
| Result persistence | **New `simulation_runs` history table** | Enables real "what changed since last run" diffs and future trend charts. The `simulations` row still updates to the latest result. |
| Out of credits | Skip, notify once, auto-pause after 3 consecutive failures | Avoids daily email spam and repeated wallet hammering. |
| Where compute happens | Render API | The optimizer, DB client, and email lib already live in `apps/api`. The Vercel function is only a trigger. |

### Consequences worth stating up front

- **No delivery-time guarantee.** Vercel Hobby cron precision is ±59 minutes. A job set
  to `0 6 * * *` fires somewhere in the 06:00–06:59 UTC window. The UI must not offer a
  "deliver at 8:00 AM" promise — only a day ("Mondays").
- **The lookback window expands.** `dateRange.startMonth/startYear` stay fixed while the
  end moves forward, so a schedule running for a year computes expected returns over a
  window one year longer than it started with. This is existing re-run behavior, kept
  deliberately for consistency. Flagged because it means results drift for two reasons at
  once (new data *and* a longer window), which the email copy should not conflate.
- **The end date is in the future for most of the month.** On 28 Jul the end date is
  2026-07-31. Yahoo returns only what exists, so this is harmless — but it is why the
  email should label the period by month, not by exact day.

---

## 2. Architecture

```
Vercel Cron (daily, 06:00 UTC)
   │  Authorization: Bearer $CRON_SECRET   (injected by Vercel)
   ▼
apps/web/src/app/api/cron/run-schedules/route.ts
   │  Authorization: Bearer $INTERNAL_API_SECRET
   ▼
POST /api/internal/run-schedules   (apps/api — NOT behind authMiddleware)
   │  responds 202 immediately, processes in background
   ▼
runDueSchedules()
   ├─ claim due schedules atomically
   ├─ for each simulation: runOptimization() → 1 credit
   ├─ append simulation_runs row + update simulations row
   └─ sendEmail(ScheduledReport)
```

The Vercel function is a dumb trigger. It exists only because Vercel Cron is free and
Render Cron is not.

---

## 3. Prerequisite refactor: extract the optimizer

**This is the biggest piece of real work and the main risk.**

All optimization logic currently lives inline in the route handler at
`apps/api/src/modules/optimization/routes.ts:27-174`, coupled to `c.get("user")`,
`c.req.valid("json")`, and `c.json()`. A cron has no request.

**Extract** `apps/api/src/modules/optimization/service.ts`:

```ts
export interface OptimizeParams { /* the existing zod schema's output type */ }
export interface OptimizeResponse { /* the existing c.json() shape */ }

export async function runOptimization(params: OptimizeParams): Promise<OptimizeResponse>
```

Move the body of the handler — the `switch (strategy)`, `getTickerAssumptions`,
`buildCovarianceMatrix`, `calcProbNeg`, and the response object — into it verbatim.

The route then becomes a thin wrapper that keeps its current behavior exactly:

```ts
const spend = await meterRequest(user, 1, idempotencyKey);
try {
  return c.json(await runOptimization(c.req.valid("json")));
} catch (err) {
  await reverseSpendOnError(spend, "optimize_failed");
  throw err;
}
```

Two constraints on this refactor:

- `target-return` and `target-risk` currently return `c.json({error}, 400)` for a missing
  target (`routes.ts:100`, `routes.ts:112`). In the service these must become thrown typed
  errors, so the runner can catch them as domain failures rather than HTTP responses.
- The metered-then-reversed credit flow **stays in the route**. The runner meters
  separately with its own idempotency key (§6).

Ship this as its own PR with tests before any scheduling code — it touches the highest-value
code in the repo and nothing else in the plan can be verified until it exists.

---

## 4. Data model

Three tables in `apps/api/src/db/schema.ts`, then `pnpm db:generate` → commit → Render runs
`db:migrate` on deploy (per CLAUDE.md; never `db:push`).

### `simulation_schedules`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text PK | UUID |
| `user_id` | text FK → `user.id` | `onDelete: cascade` |
| `name` | text | user label, nullable |
| `cadence` | text | `daily` \| `weekly` \| `monthly` |
| `day_of_week` | integer | 0–6, weekly only |
| `day_of_month` | integer | **1–28 only**, monthly only — avoids the "31st of February" class of bug |
| `timezone` | text | IANA, default `UTC`. Used for day-boundary math, not delivery hour |
| `locale` | text | `es` \| `en`, captured at creation (see §7) |
| `active` | integer bool | default true |
| `next_run_at` | integer ts | the due-check column; indexed |
| `last_run_at` | integer ts | nullable |
| `consecutive_failures` | integer | default 0, drives auto-pause |
| `created_at` / `updated_at` | integer ts | |

Index on `(active, next_run_at)` — the runner's only hot query.

### `schedule_simulations`

Join table; a schedule covers one or more simulations, one digest email per run.

| Column | Type |
| --- | --- |
| `schedule_id` | text FK → `simulation_schedules.id`, cascade |
| `simulation_id` | text FK → `simulations.id`, cascade |

Unique on `(schedule_id, simulation_id)`.

### `simulation_runs`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text PK | UUID |
| `simulation_id` | text FK → `simulations.id` | cascade |
| `schedule_id` | text FK → `simulation_schedules.id` | `onDelete: set null`; null = manual re-run |
| `params` | text | JSON snapshot of params used for *this* run |
| `result` | text | JSON result |
| `status` | text | `success` \| `failed` |
| `error_message` | text | nullable |
| `created_at` | integer ts | indexed with `simulation_id` |

Snapshotting `params` per run matters: the expanding window means the params of run N are
genuinely different from run N+1, and a diff is meaningless without knowing both.

**Backfill:** none. Existing simulations simply have no run history; the first scheduled
run has nothing to diff against and the email should render a "first run" variant rather
than a diff.

---

## 5. API surface

### User-facing (behind `authMiddleware`, scoped by `userId` like `simulations/routes.ts`)

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/schedules` | list caller's schedules + their simulations |
| `POST` | `/api/schedules` | create; computes initial `next_run_at`; captures `locale` |
| `PATCH` | `/api/schedules/:id` | rename, change cadence, pause/resume (resume resets `consecutive_failures`) |
| `DELETE` | `/api/schedules/:id` | delete |
| `GET` | `/api/simulations/:id/runs` | run history for the detail view |

Validation at create time must **reject params shapes the runner cannot replay** (§9).

### Internal

`POST /api/internal/run-schedules` — no `authMiddleware`. Guarded by a timing-safe compare
of `Authorization: Bearer $INTERNAL_API_SECRET`. Responds `202` immediately, then processes
in the background (mirroring the fire-and-forget pattern already used at
`apps/api/src/modules/tasks/routes.ts:31`).

New env vars in `apps/api/src/config/env.ts` and `render.yaml`:

- `INTERNAL_API_SECRET` (required in production — fail startup if absent when
  `NODE_ENV === "production"`, rather than defaulting to something guessable)

On Vercel: `CRON_SECRET` and `INTERNAL_API_SECRET`.

---

## 6. The runner

`apps/api/src/modules/schedules/runner.ts`

```
runDueSchedules():
  now = Date.now()
  due = SELECT * FROM simulation_schedules
        WHERE active = 1 AND next_run_at <= now

  for each schedule:
     # 1. CLAIM atomically — prevents double-run on retry or concurrent instances
     UPDATE simulation_schedules
        SET next_run_at = <computed next>, last_run_at = now
      WHERE id = ? AND next_run_at <= now
     if rowsAffected == 0: continue        # another worker won the race

     # 2. Run each simulation
     for each simulation in schedule:
        params    = parse + validate simulation.params      # skip on failure
        nextParams = bumpEndDateToCurrentMonth(params)
        key       = `schedule:${scheduleId}:${simId}:${runDateISO}`
        spend     = spendCredit({userId, idempotencyKey: key, cost: 1, simulationId})
                    # 402 INSUFFICIENT_CREDITS → abort schedule, go to step 4
        try:
           result = runOptimization(toOptimizeParams(nextParams))
        catch:
           reverseSpend(spend); record failed simulation_runs row; continue

        INSERT simulation_runs (success)
        UPDATE simulations SET params, result       # keep latest-wins semantics

     # 3. Email the digest, diffing against the previous simulation_runs row
     sendEmail(ScheduledReport)
     UPDATE consecutive_failures = 0

     # 4. On insufficient credits:
     consecutive_failures += 1
     if first failure: send "out of credits" email
     if consecutive_failures >= 3: active = false
```

### Why the claim-first ordering

`next_run_at` advances **before** the work runs. If the batch crashes halfway, the schedule
does not retry in a tight loop — it waits for its next natural slot. Combined with the
idempotency key, a same-day double-fire is a no-op rather than a double charge.

The atomic conditional `UPDATE ... WHERE next_run_at <= now` + `rowsAffected` check is the
same concurrency pattern already proven in `spendCredit`
(`apps/api/src/lib/billing/spend.ts:45`).

### Idempotency key

`schedule:{scheduleId}:{simulationId}:{YYYY-MM-DD}` — date-scoped, so Vercel firing twice
in one day replays the existing ledger row instead of charging again. `spendCredit` already
handles this (`spend.ts:40`); the key just has to be deterministic, **not** `newIdempotencyKey()`.

### Computing `next_run_at`

Day-boundary math in the schedule's `timezone`, so "every Monday" means Monday where the
user lives. `day_of_month` capped at 28. No third-party cron parser needed for three fixed
cadences — hand-rolled and unit-tested is smaller than a dependency here.

---

## 7. Email

New template `apps/api/src/lib/email/templates/ScheduledReport.tsx`, following the existing
`VerifyEmail.tsx` structure (React Email components + inline `styles` object).

New keys on the `EmailMessages` interface in `apps/api/src/lib/email/i18n.ts`, filled for
**both** `es` and `en`:

- `scheduledSubject`, `scheduledHeading`, `scheduledIntro`
- column labels: expected return, volatility, Sharpe
- `scheduledFirstRun` (no prior run to compare)
- `scheduledNoCredits` + `scheduledPaused`
- `scheduledFooter` with an unsubscribe/manage link

Content per simulation: name, period (**DD/MM/YYYY**, per CLAUDE.md), the three headline
metrics with delta vs the previous `simulation_runs` row, top weight changes, and a link
into the app.

### Locale

`getLocaleFromRequest` (`apps/api/src/lib/email/locale.ts`) reads the `NEXT_LOCALE` cookie —
**there is no request when a cron fires.** Capture the locale at schedule-creation time into
`simulation_schedules.locale` and read it in the runner.

This is the single easiest thing in the plan to forget, and the failure mode is silent:
everything works, and every scheduled email goes out in Spanish to English users.

---

## 8. Web

### Cron entry point

`apps/web/src/app/api/cron/run-schedules/route.ts`

- verify `Authorization: Bearer ${process.env.CRON_SECRET}` (Vercel injects it)
- `export const maxDuration = 300`
- POST to `${BACKEND_URL}/api/internal/run-schedules` with `INTERNAL_API_SECRET`
- `AbortSignal.timeout(120_000)` + one retry — **a free Render instance may be spun down
  and take ~60s to wake**, and the default fetch timeout will not survive that

`vercel.json`:

```json
"crons": [{ "path": "/api/cron/run-schedules", "schedule": "0 6 * * *" }]
```

### UI

- A schedules section (list, create, pause/resume, delete) with a simulation multi-select
- Cadence picker — day-level only, **no time-of-day field**, since ±59 min precision cannot
  honor one
- Run history on the simulation detail view, reading `GET /api/simulations/:id/runs`
- New `Schedules` namespace in **both** `apps/web/messages/es.json` and `en.json`; no
  hardcoded strings (CLAUDE.md)

---

## 9. Known risks

### Mobile-created simulations will break the runner

`simulations.params` is stored as opaque JSON — the API validates it with
`z.object({}).passthrough()` (`apps/api/src/modules/simulations/routes.ts:70`), so nothing
has ever enforced its shape.

Web writes camelCase `SimulationParams` with a `dateRange: {startMonth, startYear, endMonth,
endYear}` object (`apps/web/src/lib/api.ts:474`). Mobile writes snake_case `OptimizeRequest`
with flat `start_date` / `end_date` strings and **no `dateRange` at all**
(`apps/mobile/src/lib/api/optimization.ts:18`).

A runner that reaches for `params.dateRange.endMonth` throws on every mobile-created
simulation.

**Mitigation:** a zod schema for the replayable params shape, applied in two places —
rejected at schedule-creation with a clear message, and skipped (recorded as a failed
`simulation_runs` row) if it slips through. Unifying the two param shapes is the real fix
but is deliberately **out of scope here**; this plan only needs to fail safely.

### Fire-and-forget on a spun-down instance

The API returns 202 and works in the background. On a free Render instance, no inbound
traffic means the 15-minute idle timer starts ticking during that work. A long batch can be
reaped mid-run.

Partial protection comes free from the design: per-simulation idempotency keys and the
already-advanced `next_run_at` mean a reaped run does not double-charge. But some users
would silently get no email that day. If this bites, the fix is a paid Render instance or
having the cron route poll to completion instead of firing and forgetting.

### Everything runs in one batch

Fine at current scale. If schedule count grows past what fits in a single 300s invocation,
the claim-first design already supports sharding — add `LIMIT n` to the due query and let
successive ticks drain the queue.

---

## 10. Build sequence

| # | Step | Est. | Depends on |
| --- | --- | --- | --- |
| 1 | Extract `runOptimization` service + tests; route becomes a wrapper | 1d | — |
| 2 | Schema (3 tables) + migration + params zod schema | 0.5d | — |
| 3 | Schedules CRUD routes + `next_run_at` math + unit tests | 0.75d | 2 |
| 4 | Runner: claim, meter, run, persist, failure/pause handling | 1d | 1, 2 |
| 5 | Email template + `es`/`en` keys + locale capture | 0.5d | 2 |
| 6 | Vercel cron route, `vercel.json`, env vars on both hosts | 0.5d | 4 |
| 7 | Web UI + translations + run history view | 1.5d | 3 |

**~5.5 days.** Steps 1 and 2 are independent and can start in parallel.

### Test coverage that actually matters

- `runOptimization` produces identical output to the current route for each of the six
  strategies (golden tests, written **before** the extraction)
- `next_run_at` across DST boundaries, month ends, and `day_of_month = 28`
- Double-fire on the same day charges exactly one credit
- Insufficient credits pauses after exactly 3 runs and emails exactly once
- Mobile-shaped params are rejected at create and skipped at run without throwing

### Ship-blocking verification

Before the first real cron fires: create a schedule due in the past, hit
`/api/internal/run-schedules` by hand, and confirm one credit spent, one `simulation_runs`
row, and one email in the right language.
