# Project Guidelines

## Language Rules

- The app is internationalized with **next-intl**. Supported locales: **Spanish (`es`, default)** and **English (`en`)**.
- All user-facing text must come from translation files — **never hardcode UI strings**. Add the key to both `apps/web/messages/es.json` and `apps/web/messages/en.json`, then read it via `useTranslations()` (client) or `getTranslations()` (server).
- All code (variable names, function names, class names, comments, documentation, file names, translation keys) must be written in **English**.
- Locale is selected via the `NEXT_LOCALE` cookie (no `[locale]` URL segment); the user toggles it from the header `LocaleSwitcher`. Config lives in `apps/web/src/i18n/`.

### Brand values are tenant data, not translated copy

The one exception to "never hardcode UI strings" is not an exception at all — it is a different
category. The product name, short name, tagline, page title and meta description are **per-tenant
configuration**, not per-locale copy: a client sets one product name, not a Spanish one and an
English one. They used to live as the `Brand` and `Metadata` namespaces in `messages/{es,en}.json`,
which are static and identical for every tenant, so they were moved out.

They now come from `organization_branding` via `apps/web/src/lib/tenant-config.ts`, are resolved
server-side from the `Host` header, and reach components through `useTenantBrand()`
(`components/tenant/TenantProvider.tsx`). **Do not move them back into the message files** — that
would give every tenant our wordmark. Everything else a user reads still belongs in `es.json` and
`en.json`.

## Date Format

- All dates displayed in charts must use the format **DD/MM/YYYY** (e.g., 31/12/2022).

## Theming

The web app supports **light and dark** appearances. The user picks `system`, `light` or `dark`
from the header `ThemeSwitcher`; the choice is persisted in the `theme` cookie (same shape as the
`NEXT_LOCALE` cookie) so the server can render the right appearance immediately.

- Tailwind runs in `darkMode: "class"`. The `dark` class goes on `<html>`.
- `apps/web/src/styles/globals.css` holds **all** colour tokens: light values in `:root`, dark
  overrides in `.dark`. Config and helpers live in `apps/web/src/lib/theme.ts`.
- The server renders `system` as dark; `THEME_INIT_SCRIPT` runs in `<head>` before first paint and
  corrects it from the OS preference, so there is no flash.
- **Never hardcode a colour.** Use a Tailwind token (`bg-card`, `text-muted-foreground`) or
  `hsl(var(--token))` inside SVG. A raw hex or `hsl()` literal only works in one theme.
- Reach for a `dark:` variant only where the two themes need genuinely different treatments —
  usually because light mode needs a firmer border or a more opaque surface than dark
  (`border-border bg-card dark:border-border/50 dark:bg-card/40`).
- Semantic status colours keep their meaning in both themes and take a darker shade on light
  (`text-emerald-600 dark:text-emerald-400`). Gain stays green, loss stays red.
- Recharts writes colours as SVG presentation attributes, which cannot read CSS variables. Chart
  **chrome** (grid, axes, tick labels, tooltip) is therefore themed by the `.recharts-*` rules in
  `globals.css`, since real CSS outranks presentation attributes. Chart **series** colours come from
  `useChartColors()` in `components/charts/chart-theme.tsx`, which returns hex values per theme.
- Glows encode emitted light and read as nothing on a light page. Where a glow marks selected or
  optimal state, give light mode a real affordance (ring, border, elevation) instead.
- The 3D globe is a deliberately dark cinematic stage in **both** themes, framed by the
  `--scene-bg` / `--scene-foreground` tokens (`bg-scene`, `text-scene-foreground`). Content drawn
  over it must use the scene tokens, not `--foreground`.

## Database Migrations

Schema changes follow a **generate → commit → migrate** workflow using Drizzle Kit:

1. Edit `apps/api/src/db/schema.ts`
2. Run `pnpm db:generate` from `apps/api/` to create a new migration file in `drizzle/`
3. Commit the migration file along with the schema change
4. On deploy, Render runs `pnpm db:migrate` automatically (non-interactive, applies only new migrations)

- **Never use `db:push` in CI/production** — it requires interactive TTY prompts
- Use `db:push` only for rapid local iteration when you don't need a migration file
- Migrations are tracked in the `__drizzle_migrations` table on both local SQLite and Turso

### Fresh local database

Every authenticated request resolves a tenant from `organization_member`, and the middleware throws
500 when it cannot. Signing up provisions a *personal* organization automatically, so signup itself
works on an empty database — but the **default (D2C) tenant** and its `localhost` domain row, which
host-based tenant resolution reads, are only created by the seed:

```bash
pnpm db:migrate     # from apps/api/
pnpm seed:dev-org   # default (D2C) organization, its settings/branding, and a localhost domain row
```

`pnpm seed:dev-org` is idempotent — run it again after any migration that touches the
`organization*` tables. A real tenant is never seeded: it is created by `pnpm provision:tenant`
(`apps/api/src/scripts/provision-tenant.ts`).

If provisioning ever fails mid-signup, the account is left with no organization and every request it
makes returns 500. `pnpm repair:orphan-orgs` finds those users and gives each one an organization.

## Authentication

- Auth is handled by **BetterAuth** (server + client)
- Server config: `apps/api/src/lib/auth.ts`
- Client config: `apps/web/src/lib/auth-client.ts`
- BetterAuth manages its own tables: `user`, `session`, `account`, `verification`
- User IDs are **text** (not integer) — all `userId` foreign keys use `text` type
- Social providers: Google, GitHub, Microsoft (configured via env vars)
- Session validation in middleware uses `auth.api.getSession()`
