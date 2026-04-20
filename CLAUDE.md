# Project Guidelines

## Language Rules

- All user-facing text (UI labels, messages, notifications, tooltips, placeholders, error messages, etc.) must be written in **Spanish**.
- All code (variable names, function names, class names, comments, documentation, file names, and any other code-related identifiers) must be written in **English**.

## Date Format

- All dates displayed in charts must use the format **DD/MM/YYYY** (e.g., 31/12/2022).

## Database Migrations

Schema changes follow a **generate → commit → migrate** workflow using Drizzle Kit:

1. Edit `apps/api/src/db/schema.ts`
2. Run `pnpm db:generate` from `apps/api/` to create a new migration file in `drizzle/`
3. Commit the migration file along with the schema change
4. On deploy, Render runs `pnpm db:migrate` automatically (non-interactive, applies only new migrations)

- **Never use `db:push` in CI/production** — it requires interactive TTY prompts
- Use `db:push` only for rapid local iteration when you don't need a migration file
- Migrations are tracked in the `__drizzle_migrations` table on both local SQLite and Turso

## Authentication

- Auth is handled by **BetterAuth** (server + client)
- Server config: `apps/api/src/lib/auth.ts`
- Client config: `apps/web/src/lib/auth-client.ts`
- BetterAuth manages its own tables: `user`, `session`, `account`, `verification`
- User IDs are **text** (not integer) — all `userId` foreign keys use `text` type
- Social providers: Google, GitHub, Microsoft (configured via env vars)
- Session validation in middleware uses `auth.api.getSession()`
