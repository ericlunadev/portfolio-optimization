-- Whitelabel tenancy, migration (C) — Deploy 2.
--
-- Flips `organization_id` to NOT NULL on the seven scoped tables and on
-- `wallet_balance`, installs the declared ON DELETE actions that (A)'s and (D-i)'s
-- ADD COLUMN silently dropped, and replaces the global unique on
-- `credit_ledger.idempotency_key` with a composite unique on
-- (organization_id, idempotency_key). The composite could not land in (A):
-- SQLite treats NULLs as distinct in a unique index, so it would have constrained
-- nothing while the column was nullable.
--
-- Ships with the release whose SELECT / UPDATE / DELETE predicates read
-- `organization_id`. There is no Deploy 3: `wallet_balance.user_id` is kept as a
-- deprecated nullable column rather than dropped, so the release still serving
-- traffic during this build — which spends with a raw `WHERE user_id = ?` —
-- keeps working.
--
-- Everything above the generated section re-runs migration (B)'s organization
-- creation, its backfill and its guard. (B)'s guard proved zero NULLs at Deploy
-- 1's build time; this runs days later, and any row written by the old release
-- during Deploy 1's build window carries a NULL. The rebuilds below would reject
-- those anyway — their INSERT ... SELECT hits the NOT NULL column — but that is
-- not the only guard worth having: for a column with no foreign key drizzle-kit
-- emits libSQL's `ALTER TABLE ... ALTER COLUMN "c" TO "c" text NOT NULL` instead,
-- which rewrites the schema without validating a single row and leaves NULLs
-- behind a NOT NULL declaration, where `WHERE col IS NULL` then returns nothing
-- forever.
--
-- Two failure modes of Deploy 1's build window are handled explicitly below,
-- because both were reproduced end to end against a scratch database and both
-- fail the way §10 rule 2 describes — exit 1, zero bytes on stderr, a Render build
-- failure with no diagnostic:
--
--   * A user who signed up during the Deploy 1 build window was created by the
--     OLD release, which has no provisioning hook, so they have no organization
--     and no membership row. Resolving `organization_id` through
--     `organization_member` alone leaves their rows NULL and the guard aborts the
--     whole migration. Step (0) below creates the missing organizations first.
--   * Between Deploy 1 and Deploy 2 there is no UNIQUE on
--     `wallet_balance.organization_id`, so the Deploy 1 release's
--     `ensureWalletRow` — whose ON CONFLICT targets the `user_id` primary key —
--     writes a SECOND wallet row for the same organization as soon as a second
--     analyst is added. That is the N-analysts-at-one-firm shape D7 exists for,
--     not a hypothetical. The NULL guard passes cleanly on it, and the failure
--     then lands inside generated DDL at `CREATE UNIQUE INDEX ... ON
--     wallet_balance (organization_id)`. Step (2) collapses the duplicates and
--     step (4) guards what is left.
--
-- If the NULL guard still fires, some row has both `organization_id` and
-- `user_id` NULL — created in the Deploy 1 window by the old release and then
-- orphaned by a user deletion. Archive and delete it the way migration (B) does,
-- then re-run:
--   UPDATE credit_ledger SET simulation_id = NULL
--     WHERE simulation_id IN (SELECT id FROM simulations WHERE user_id IS NULL);
--   DELETE FROM simulations      WHERE user_id IS NULL;
--   DELETE FROM background_tasks WHERE user_id IS NULL;
--
-- (0) Organizations for anyone the Deploy 1 window left without one. Same
--     statements as migration (B) steps (3)-(6), same `WHERE NOT EXISTS`
--     idempotency, so this is a no-op on a database that saw no signups in the
--     window. The extra `organization_member` predicate on the first INSERT is
--     the one difference from (B): by now some users legitimately belong to a
--     tenant organization, and re-running (B)'s predicate unchanged would give
--     each of them a second, memberless personal organization — which step (5)
--     at the end of this file would then hand a wallet row.
INSERT INTO `organization` (`id`, `slug`, `name`, `tier`, `is_default`, `created_at`)
SELECT 'u-' || lower(u.`id`), 'u-' || lower(u.`id`), u.`name`, 'cobranded', 0, unixepoch()
FROM `user` u
WHERE NOT EXISTS (SELECT 1 FROM `organization_member` m WHERE m.`user_id` = u.`id`)
  AND NOT EXISTS (SELECT 1 FROM `organization` o WHERE o.`slug` = 'u-' || lower(u.`id`));
--> statement-breakpoint
INSERT INTO `organization_member` (`id`, `organization_id`, `user_id`, `role`, `created_at`)
SELECT 'm-' || lower(u.`id`), 'u-' || lower(u.`id`), u.`id`, 'owner', unixepoch()
FROM `user` u
WHERE NOT EXISTS (SELECT 1 FROM `organization_member` m WHERE m.`user_id` = u.`id`);
--> statement-breakpoint
-- Today's behaviour, not the schema.ts column defaults — see migration (B) step (5).
INSERT INTO `organization_settings` (`organization_id`, `academia_enabled`, `advisor_mode`, `advisor_booking_url`, `advisor_cost_credits`, `crypto_rail_enabled`, `fund_allowlist`, `overdraft_limit`, `signup_grant_credits`)
SELECT o.`id`, 1, 'platform', NULL, 100, 1, NULL, 0, 3
FROM `organization` o
WHERE NOT EXISTS (SELECT 1 FROM `organization_settings` s WHERE s.`organization_id` = o.`id`);
--> statement-breakpoint
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
-- (1) Re-run (B)'s backfill, now that every user has a membership row to resolve
--     through.
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
UPDATE `wallet_balance` SET `organization_id` = (
	SELECT m.`organization_id` FROM `organization_member` m WHERE m.`user_id` = `wallet_balance`.`user_id`
) WHERE `organization_id` IS NULL;
--> statement-breakpoint
-- (2) Collapse the duplicate wallets the Deploy 1 window can leave behind: sum
--     their credits into the lowest rowid for the organization and delete the
--     rest, so the total the wallet/ledger invariant checks is preserved. This
--     has to run before the rebuilds, because `CREATE UNIQUE INDEX ... ON
--     wallet_balance (organization_id)` down there fails on the second row and
--     `drizzle-kit migrate` reports it with 0 bytes on stderr.
--
--     The merge goes through a work table rather than a correlated UPDATE over
--     `wallet_balance` itself, so the sums are all computed from the pre-merge
--     rows and never from a row this statement has already rewritten.
--
--     One consequence to be aware of, and it is the reason this is a merge and
--     not a delete: the surviving row keeps only the earliest analyst's
--     `user_id`. The release still serving traffic during this build spends with
--     a raw `WHERE user_id = ?` (spend.ts:46-50, :101-105), so for the rest of
--     the build window every other analyst at that firm reads a missing wallet
--     and `ensureWalletRow` 5xxs against the new UNIQUE instead of writing a
--     second row. That window closes when the new release goes live.
DROP TABLE IF EXISTS `_wallet_dupe_merge`;
--> statement-breakpoint
CREATE TABLE `_wallet_dupe_merge` (
	`organization_id` text NOT NULL,
	`keep_rowid` integer NOT NULL,
	`credits` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `_wallet_dupe_merge` (`organization_id`, `keep_rowid`, `credits`)
SELECT `organization_id`, min(`rowid`), sum(`credits`)
FROM `wallet_balance`
WHERE `organization_id` IS NOT NULL
GROUP BY `organization_id`
HAVING count(*) > 1;
--> statement-breakpoint
UPDATE `wallet_balance`
SET `credits` = (SELECT m.`credits` FROM `_wallet_dupe_merge` m WHERE m.`keep_rowid` = `wallet_balance`.`rowid`),
    `updated_at` = unixepoch()
WHERE `rowid` IN (SELECT `keep_rowid` FROM `_wallet_dupe_merge`);
--> statement-breakpoint
DELETE FROM `wallet_balance`
WHERE `organization_id` IN (SELECT `organization_id` FROM `_wallet_dupe_merge`)
  AND `rowid` NOT IN (SELECT `keep_rowid` FROM `_wallet_dupe_merge`);
--> statement-breakpoint
DROP TABLE `_wallet_dupe_merge`;
--> statement-breakpoint
-- (3) NULL guard. `_backfill_guard.x` is NOT NULL, so any INSERT below that finds
--     an unstamped row fails and aborts the migration.
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
INSERT INTO `_backfill_guard` (`x`) SELECT NULL FROM `wallet_balance` WHERE `organization_id` IS NULL LIMIT 1;
--> statement-breakpoint
DROP TABLE `_backfill_guard`;
--> statement-breakpoint
-- (4) Two-wallet guard, re-run after the merge. It carries its own table so the
--     abort names `_wallet_dupe_guard` and points at step (2) rather than reading
--     like the NULL guard above. Step (2) should leave it nothing to find; it is
--     here so that a regression in step (2) aborts diagnosably instead of dying
--     inside the generated `CREATE UNIQUE INDEX` further down, which surfaces as
--     a Render build failure with 0 bytes on stderr.
DROP TABLE IF EXISTS `_wallet_dupe_guard`;
--> statement-breakpoint
CREATE TABLE `_wallet_dupe_guard` (`x` text NOT NULL);
--> statement-breakpoint
INSERT INTO `_wallet_dupe_guard` (`x`) SELECT NULL FROM `wallet_balance` WHERE `organization_id` IS NOT NULL GROUP BY `organization_id` HAVING count(*) > 1 LIMIT 1;
--> statement-breakpoint
DROP TABLE `_wallet_dupe_guard`;
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_credit_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`organization_id` text NOT NULL,
	`delta` integer NOT NULL,
	`reason` text NOT NULL,
	`payment_id` text,
	`simulation_id` text,
	`idempotency_key` text,
	`balance_after` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`simulation_id`) REFERENCES `simulations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_credit_ledger`("id", "user_id", "organization_id", "delta", "reason", "payment_id", "simulation_id", "idempotency_key", "balance_after", "created_at") SELECT "id", "user_id", "organization_id", "delta", "reason", "payment_id", "simulation_id", "idempotency_key", "balance_after", "created_at" FROM `credit_ledger`;--> statement-breakpoint
DROP TABLE `credit_ledger`;--> statement-breakpoint
ALTER TABLE `__new_credit_ledger` RENAME TO `credit_ledger`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `ledger_user_idx` ON `credit_ledger` (`user_id`);--> statement-breakpoint
CREATE INDEX `ledger_created_idx` ON `credit_ledger` (`created_at`);--> statement-breakpoint
CREATE INDEX `ledger_org_idx` ON `credit_ledger` (`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_org_idempotency_unique` ON `credit_ledger` (`organization_id`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `__new_wallet_balance` (
	`user_id` text,
	`organization_id` text NOT NULL,
	`credits` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_wallet_balance`("user_id", "organization_id", "credits", "updated_at") SELECT "user_id", "organization_id", "credits", "updated_at" FROM `wallet_balance`;--> statement-breakpoint
DROP TABLE `wallet_balance`;--> statement-breakpoint
ALTER TABLE `__new_wallet_balance` RENAME TO `wallet_balance`;--> statement-breakpoint
CREATE UNIQUE INDEX `wallet_balance_organization_id_unique` ON `wallet_balance` (`organization_id`);--> statement-breakpoint
CREATE TABLE `__new_background_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`organization_id` text NOT NULL,
	`task_type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`progress` real DEFAULT 0,
	`result_data` text,
	`error_message` text,
	`created_at` integer DEFAULT (unixepoch()),
	`started_at` integer,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_background_tasks`("id", "user_id", "organization_id", "task_type", "status", "progress", "result_data", "error_message", "created_at", "started_at", "completed_at") SELECT "id", "user_id", "organization_id", "task_type", "status", "progress", "result_data", "error_message", "created_at", "started_at", "completed_at" FROM `background_tasks`;--> statement-breakpoint
DROP TABLE `background_tasks`;--> statement-breakpoint
ALTER TABLE `__new_background_tasks` RENAME TO `background_tasks`;--> statement-breakpoint
CREATE INDEX `background_tasks_org_idx` ON `background_tasks` (`organization_id`);--> statement-breakpoint
CREATE TABLE `__new_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`package_id` text,
	`rail` text NOT NULL,
	`external_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`credits_purchased` integer NOT NULL,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch()),
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`package_id`) REFERENCES `credit_packages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_payments`("id", "user_id", "organization_id", "package_id", "rail", "external_id", "status", "amount_minor", "currency", "credits_purchased", "metadata", "created_at", "completed_at") SELECT "id", "user_id", "organization_id", "package_id", "rail", "external_id", "status", "amount_minor", "currency", "credits_purchased", "metadata", "created_at", "completed_at" FROM `payments`;--> statement-breakpoint
DROP TABLE `payments`;--> statement-breakpoint
ALTER TABLE `__new_payments` RENAME TO `payments`;--> statement-breakpoint
CREATE UNIQUE INDEX `payments_external_id_unique` ON `payments` (`external_id`);--> statement-breakpoint
CREATE INDEX `payments_user_idx` ON `payments` (`user_id`);--> statement-breakpoint
CREATE INDEX `payments_org_idx` ON `payments` (`organization_id`);--> statement-breakpoint
CREATE TABLE `__new_simulations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`organization_id` text NOT NULL,
	`name` text,
	`params` text NOT NULL,
	`result` text NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`shared_with_org` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_simulations`("id", "user_id", "organization_id", "name", "params", "result", "pinned", "shared_with_org", "created_at") SELECT "id", "user_id", "organization_id", "name", "params", "result", "pinned", "shared_with_org", "created_at" FROM `simulations`;--> statement-breakpoint
DROP TABLE `simulations`;--> statement-breakpoint
ALTER TABLE `__new_simulations` RENAME TO `simulations`;--> statement-breakpoint
CREATE INDEX `simulations_org_idx` ON `simulations` (`organization_id`);--> statement-breakpoint
CREATE TABLE `__new_user_assumptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`fund_id` integer NOT NULL,
	`exp_ret` real,
	`volatility` real,
	`updated_at` integer DEFAULT (unixepoch()),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`fund_id`) REFERENCES `funds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_user_assumptions`("id", "user_id", "organization_id", "fund_id", "exp_ret", "volatility", "updated_at") SELECT "id", "user_id", "organization_id", "fund_id", "exp_ret", "volatility", "updated_at" FROM `user_assumptions`;--> statement-breakpoint
DROP TABLE `user_assumptions`;--> statement-breakpoint
ALTER TABLE `__new_user_assumptions` RENAME TO `user_assumptions`;--> statement-breakpoint
CREATE INDEX `user_assumptions_org_idx` ON `user_assumptions` (`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_fund_unique` ON `user_assumptions` (`user_id`,`fund_id`);--> statement-breakpoint
CREATE TABLE `__new_user_correlations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`fund_id_1` integer NOT NULL,
	`fund_id_2` integer NOT NULL,
	`correlation` real NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`fund_id_1`) REFERENCES `funds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fund_id_2`) REFERENCES `funds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_user_correlations`("id", "user_id", "organization_id", "fund_id_1", "fund_id_2", "correlation", "updated_at") SELECT "id", "user_id", "organization_id", "fund_id_1", "fund_id_2", "correlation", "updated_at" FROM `user_correlations`;--> statement-breakpoint
DROP TABLE `user_correlations`;--> statement-breakpoint
ALTER TABLE `__new_user_correlations` RENAME TO `user_correlations`;--> statement-breakpoint
CREATE INDEX `user_correlations_org_idx` ON `user_correlations` (`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_corr_unique` ON `user_correlations` (`user_id`,`fund_id_1`,`fund_id_2`);--> statement-breakpoint
CREATE TABLE `__new_user_profile` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`country_code` text,
	`currency` text,
	`experience` text,
	`horizon` text,
	`risk_behavior` text,
	`risk_tolerance` text,
	`goal` text,
	`markets_of_interest` text,
	`other_markets` text,
	`concept_familiarity` text,
	`current_step` integer DEFAULT 1 NOT NULL,
	`completed_at` integer,
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer DEFAULT (unixepoch()),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_user_profile`("id", "user_id", "organization_id", "country_code", "currency", "experience", "horizon", "risk_behavior", "risk_tolerance", "goal", "markets_of_interest", "other_markets", "concept_familiarity", "current_step", "completed_at", "created_at", "updated_at") SELECT "id", "user_id", "organization_id", "country_code", "currency", "experience", "horizon", "risk_behavior", "risk_tolerance", "goal", "markets_of_interest", "other_markets", "concept_familiarity", "current_step", "completed_at", "created_at", "updated_at" FROM `user_profile`;--> statement-breakpoint
DROP TABLE `user_profile`;--> statement-breakpoint
ALTER TABLE `__new_user_profile` RENAME TO `user_profile`;--> statement-breakpoint
CREATE UNIQUE INDEX `user_profile_user_id_unique` ON `user_profile` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_profile_org_idx` ON `user_profile` (`organization_id`);
--> statement-breakpoint
-- (5) Finally, the organizations that still have no wallet row — including any
-- created by step (0). (D-ii) could not create these:
-- `wallet_balance.user_id` was still the NOT NULL primary key then,
-- and an organization with no members — the default D2C tenant, which exists only
-- to own the hostname — has no user id to put in it. Now that `user_id` is
-- nullable, every organization gets exactly one wallet.
INSERT INTO `wallet_balance` (`user_id`, `organization_id`, `credits`, `updated_at`)
SELECT NULL, o.`id`, 0, unixepoch()
FROM `organization` o
WHERE NOT EXISTS (SELECT 1 FROM `wallet_balance` w WHERE w.`organization_id` = o.`id`);
