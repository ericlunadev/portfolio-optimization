-- Whitelabel tenancy, migration (B) — Deploy 1. Custom backfill.
--
-- Gives every scoped row an organization, so migration (C) can make the column
-- NOT NULL. Order: archive and delete the orphans, create one organization per
-- existing user plus the default (D2C) tenant, then stamp the seven tables.
--
-- Every statement below stands alone between breakpoint markers. A
-- chunk holding two statements executes only the first, with no error, while the
-- migration is still recorded as applied.
--
-- `_archived_orphan_simulations` and `_archived_orphan_background_tasks` are
-- DELIBERATE and they are PERMANENT until someone decides otherwise. The orphan
-- deletion in step (1) is not signed off yet (PLAN.md Task 0.3), so the archived
-- rows have to stay recoverable — this file is the only copy of them.
--
-- Two consequences to know about:
--   * They are invisible to `drizzle-kit generate`, which diffs schema.ts against
--     the snapshot and has never heard of them, so nothing will ever propose
--     dropping them for you.
--   * `db:push` diffs the LIVE database instead and would offer to drop them
--     both. That is one more reason never to run it here (CLAUDE.md).
-- Follow-up: once the orphan policy is confirmed against production and the
-- archived rows are either restored or written off, drop both tables in their own
-- migration.
--
-- (1) Orphans. Count them before running this against production:
--       SELECT count(*) FROM simulations      WHERE user_id IS NULL;
--       SELECT count(*) FROM background_tasks WHERE user_id IS NULL;
--     In the only production snapshot anyone has, 22 of 23 simulations are
--     orphans — the dominant case, not an edge case. They are already
--     unreachable, since every read/update/delete path in simulations/routes.ts
--     filters on eq(simulations.userId, user.id), and they have no user to
--     inherit an organization from. Archive, then delete. Every statement in
--     this step is a no-op when there are zero orphans.
CREATE TABLE IF NOT EXISTS `_archived_orphan_simulations` (
	`id` text,
	`user_id` text,
	`name` text,
	`params` text,
	`result` text,
	`pinned` integer,
	`created_at` integer,
	`archived_at` integer
);
--> statement-breakpoint
INSERT INTO `_archived_orphan_simulations` (`id`, `user_id`, `name`, `params`, `result`, `pinned`, `created_at`, `archived_at`)
SELECT `id`, `user_id`, `name`, `params`, `result`, `pinned`, `created_at`, unixepoch()
FROM `simulations` WHERE `user_id` IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `_archived_orphan_background_tasks` (
	`id` text,
	`user_id` text,
	`task_type` text,
	`status` text,
	`progress` real,
	`result_data` text,
	`error_message` text,
	`created_at` integer,
	`started_at` integer,
	`completed_at` integer,
	`archived_at` integer
);
--> statement-breakpoint
INSERT INTO `_archived_orphan_background_tasks` (`id`, `user_id`, `task_type`, `status`, `progress`, `result_data`, `error_message`, `created_at`, `started_at`, `completed_at`, `archived_at`)
SELECT `id`, `user_id`, `task_type`, `status`, `progress`, `result_data`, `error_message`, `created_at`, `started_at`, `completed_at`, unixepoch()
FROM `background_tasks` WHERE `user_id` IS NULL;
--> statement-breakpoint
-- credit_ledger.simulation_id is ON DELETE no action, so the references have to
-- go before the rows they point at.
UPDATE `credit_ledger` SET `simulation_id` = NULL
WHERE `simulation_id` IN (SELECT `id` FROM `simulations` WHERE `user_id` IS NULL);
--> statement-breakpoint
DELETE FROM `simulations` WHERE `user_id` IS NULL;
--> statement-breakpoint
DELETE FROM `background_tasks` WHERE `user_id` IS NULL;
--> statement-breakpoint
-- (2) The default (D2C) tenant: it owns the production hostname and is what
--     Task 1.1 serves for an unknown host. It has no members — every existing
--     user gets their own organization in step (3) — so no data lives in it.
--     Exactly one organization carries is_default.
INSERT INTO `organization` (`id`, `slug`, `name`, `tier`, `is_default`, `created_at`)
SELECT 'org-d2c', 'd2c', 'Optimización de Portafolio', 'cobranded', 1, unixepoch()
WHERE NOT EXISTS (SELECT 1 FROM `organization` WHERE `is_default` = 1);
--> statement-breakpoint
-- (3) One organization per existing user. The slug comes from the BetterAuth user
--     id, never from the email local-part: of the six real local-parts across both
--     databases five are invalid DNS labels — `luna.eric.santiago` is four labels,
--     which a `*.optim.app` wildcard certificate does not cover, and three contain
--     `+`. A BetterAuth id is a 32-character alphanumeric: a valid single label,
--     unique by construction, no dedupe pass needed. The organization id is
--     derived the same way rather than being a fresh UUID, so the backfill stays
--     auditable and re-runnable; organizations the app creates use randomUUID().
INSERT INTO `organization` (`id`, `slug`, `name`, `tier`, `is_default`, `created_at`)
SELECT 'u-' || lower(u.`id`), 'u-' || lower(u.`id`), u.`name`, 'cobranded', 0, unixepoch()
FROM `user` u
WHERE NOT EXISTS (SELECT 1 FROM `organization` o WHERE o.`slug` = 'u-' || lower(u.`id`));
--> statement-breakpoint
-- (4) Membership, role 'owner'.
INSERT INTO `organization_member` (`id`, `organization_id`, `user_id`, `role`, `created_at`)
SELECT 'm-' || lower(u.`id`), 'u-' || lower(u.`id`), u.`id`, 'owner', unixepoch()
FROM `user` u
WHERE NOT EXISTS (SELECT 1 FROM `organization_member` m WHERE m.`user_id` = u.`id`);
--> statement-breakpoint
-- (5) Settings carry TODAY'S behaviour, not the column defaults. The defaults in
--     schema.ts ('off', crypto rail disabled) are the *whitelabel* defaults;
--     using them here would hide the advisor CTA — rendered unconditionally at
--     MarkowitzResults.tsx:744 — and remove the crypto rail tab in
--     PackagePicker.tsx:68-80 for every existing user, inside the phase whose
--     definition of done is "zero user-visible change".
--     advisor_booking_url stays NULL: the URL still comes from
--     env.ADVISOR_BOOKING_URL until Task 3.3 moves it onto the organization row.
INSERT INTO `organization_settings` (`organization_id`, `academia_enabled`, `advisor_mode`, `advisor_booking_url`, `advisor_cost_credits`, `crypto_rail_enabled`, `fund_allowlist`, `overdraft_limit`, `signup_grant_credits`)
SELECT o.`id`, 1, 'platform', NULL, 100, 1, NULL, 0, 3
FROM `organization` o
WHERE NOT EXISTS (SELECT 1 FROM `organization_settings` s WHERE s.`organization_id` = o.`id`);
--> statement-breakpoint
-- (6) Branding carries today's values, from the default locale (es) in
--     apps/web/messages/es.json. accent_hex is hsl(38 65% 55%) written as hex —
--     today's dark-mode `--primary` in globals.css — because Task 1.2's
--     deriveTenantPalette takes one hex and derives both themes from it.
--     support_email, privacy_policy_url and terms_url stay NULL: no value for any
--     of them exists anywhere in the repo (PLAN.md §0.2 item 3). The provisioning
--     CLI refuses to create a real tenant without them.
INSERT INTO `organization_branding` (`organization_id`, `product_name`, `product_short_name`, `tagline`, `accent_hex`, `font_key`, `updated_at`)
SELECT o.`id`,
       'Optimización de Portafolio',
       'Optim.',
       'Optimización de portafolio basada en la teoría de Markowitz',
       '#d7a042',
       'instrument-sans',
       unixepoch()
FROM `organization` o
WHERE NOT EXISTS (SELECT 1 FROM `organization_branding` b WHERE b.`organization_id` = o.`id`);
--> statement-breakpoint
-- (7) Domain rows. Only the default tenant gets one. organization_domain.hostname
--     is NOT NULL UNIQUE, so the personal organizations cannot all share a blank
--     value — and they do not need one: they reach the app through the default
--     tenant, and Task 1.0's transactional-email fallback resolves an org with no
--     domain row to the default tenant's hostname.
--
--     OPEN — PLAN.md §0.2 item 4. Confirm this hostname before Phase 1. It is the
--     only hostname literal in the repo (apps/api/wrangler.toml:7, a stale
--     Cloudflare Workers config from before the Vercel/Render split), FRONTEND_URL
--     is sync:false on Render, and D6's *.optim.app wildcard does not exist yet.
--     To correct it:
--       UPDATE organization_domain SET hostname = '<real host>' WHERE id = 'dom-d2c';
INSERT INTO `organization_domain` (`id`, `organization_id`, `hostname`, `is_primary`)
SELECT 'dom-d2c', o.`id`, 'portfolio-optimization-omega.vercel.app', 1
FROM `organization` o
WHERE o.`is_default` = 1
  AND NOT EXISTS (SELECT 1 FROM `organization_domain` d WHERE d.`id` = 'dom-d2c');
--> statement-breakpoint
-- (8) Stamp the seven scoped tables from the membership row. Each UPDATE is
--     restricted to `organization_id IS NULL` so migration (C) can re-run it for
--     rows written by the old release during Deploy 1's build window.
UPDATE `simulations` SET `organization_id` = (
	SELECT m.`organization_id` FROM `organization_member` m WHERE m.`user_id` = `simulations`.`user_id`
) WHERE `organization_id` IS NULL;
--> statement-breakpoint
UPDATE `user_profile` SET `organization_id` = (
	SELECT m.`organization_id` FROM `organization_member` m WHERE m.`user_id` = `user_profile`.`user_id`
) WHERE `organization_id` IS NULL;
--> statement-breakpoint
UPDATE `user_assumptions` SET `organization_id` = (
	SELECT m.`organization_id` FROM `organization_member` m WHERE m.`user_id` = `user_assumptions`.`user_id`
) WHERE `organization_id` IS NULL;
--> statement-breakpoint
UPDATE `user_correlations` SET `organization_id` = (
	SELECT m.`organization_id` FROM `organization_member` m WHERE m.`user_id` = `user_correlations`.`user_id`
) WHERE `organization_id` IS NULL;
--> statement-breakpoint
UPDATE `background_tasks` SET `organization_id` = (
	SELECT m.`organization_id` FROM `organization_member` m WHERE m.`user_id` = `background_tasks`.`user_id`
) WHERE `organization_id` IS NULL;
--> statement-breakpoint
UPDATE `credit_ledger` SET `organization_id` = (
	SELECT m.`organization_id` FROM `organization_member` m WHERE m.`user_id` = `credit_ledger`.`user_id`
) WHERE `organization_id` IS NULL;
--> statement-breakpoint
UPDATE `payments` SET `organization_id` = (
	SELECT m.`organization_id` FROM `organization_member` m WHERE m.`user_id` = `payments`.`user_id`
) WHERE `organization_id` IS NULL;
--> statement-breakpoint
-- (9) Guard. `_backfill_guard.x` is NOT NULL, so the INSERT below fails — and
--     aborts the migration — if any row is still unstamped. The leading
--     DROP ... IF EXISTS matters: when the guard fires the migration stops before
--     its own DROP at the end, so a retry would otherwise die at CREATE TABLE with
--     a different error, and `drizzle-kit migrate` reports failures with 0 bytes
--     on stderr.
DROP TABLE IF EXISTS `_backfill_guard`;
--> statement-breakpoint
CREATE TABLE `_backfill_guard` (`x` text NOT NULL);
--> statement-breakpoint
INSERT INTO `_backfill_guard` (`x`) SELECT NULL FROM `simulations` WHERE `organization_id` IS NULL LIMIT 1;
--> statement-breakpoint
INSERT INTO `_backfill_guard` (`x`) SELECT NULL FROM `user_profile` WHERE `organization_id` IS NULL LIMIT 1;
--> statement-breakpoint
INSERT INTO `_backfill_guard` (`x`) SELECT NULL FROM `user_assumptions` WHERE `organization_id` IS NULL LIMIT 1;
--> statement-breakpoint
INSERT INTO `_backfill_guard` (`x`) SELECT NULL FROM `user_correlations` WHERE `organization_id` IS NULL LIMIT 1;
--> statement-breakpoint
INSERT INTO `_backfill_guard` (`x`) SELECT NULL FROM `background_tasks` WHERE `organization_id` IS NULL LIMIT 1;
--> statement-breakpoint
INSERT INTO `_backfill_guard` (`x`) SELECT NULL FROM `credit_ledger` WHERE `organization_id` IS NULL LIMIT 1;
--> statement-breakpoint
INSERT INTO `_backfill_guard` (`x`) SELECT NULL FROM `payments` WHERE `organization_id` IS NULL LIMIT 1;
--> statement-breakpoint
DROP TABLE `_backfill_guard`;
