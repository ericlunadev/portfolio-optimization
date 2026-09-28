-- Whitelabel tenancy, migration (A) — Deploy 1.
--
-- `organization_id` lands NULLABLE on purpose. For a NOT NULL column with no
-- default drizzle-kit emits `ADD ... text NOT NULL REFERENCES organization(id)`,
-- which libSQL rejects on a populated table ("Cannot add a NOT NULL column with
-- default value NULL") while succeeding silently on an empty dev database.
-- Migration (C) does the flip, after (B) has backfilled every row.
--
-- The `ADD COLUMN` form below emits only `REFERENCES organization(id)`, so the
-- live foreign keys are ON DELETE NO ACTION even though the Drizzle snapshot
-- claims cascade. (C) rebuilds these tables and installs the declared actions --
-- cascade for the five non-financial tables, `no action` for `payments` and
-- `credit_ledger`. A reviewer who sees `no action` in (C) should not "fix" it.
--
-- Two changes deliberately wait for (C): the composite
-- unique(organization_id, idempotency_key) -- SQLite treats NULLs as distinct in
-- a unique index, so it would constrain nothing while the column is nullable --
-- and `credit_ledger.user_id` becoming nullable ON DELETE set null. Generating
-- that flip here makes drizzle-kit rebuild the table with an
-- `INSERT ... SELECT "organization_id" ... FROM credit_ledger` that reads a
-- column the old table does not have yet, and the migration dies on
-- `no such column: organization_id`.
CREATE TABLE `organization` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`tier` text DEFAULT 'cobranded' NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`logo` text,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_slug_unique` ON `organization` (`slug`);--> statement-breakpoint
CREATE TABLE `organization_branding` (
	`organization_id` text PRIMARY KEY NOT NULL,
	`product_name` text,
	`product_short_name` text,
	`tagline` text,
	`accent_hex` text,
	`font_key` text DEFAULT 'instrument-sans',
	`logo_url` text,
	`favicon_url` text,
	`support_email` text,
	`privacy_policy_url` text,
	`terms_url` text,
	`disclaimer_text` text,
	`updated_at` integer DEFAULT (unixepoch()),
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `organization_domain` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`hostname` text NOT NULL,
	`is_primary` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_domain_hostname_unique` ON `organization_domain` (`hostname`);--> statement-breakpoint
CREATE INDEX `org_domain_host_idx` ON `organization_domain` (`hostname`);--> statement-breakpoint
CREATE TABLE `organization_member` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `org_member_org_idx` ON `organization_member` (`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `org_member_user_unique` ON `organization_member` (`user_id`);--> statement-breakpoint
CREATE TABLE `organization_settings` (
	`organization_id` text PRIMARY KEY NOT NULL,
	`academia_enabled` integer DEFAULT true NOT NULL,
	`advisor_mode` text DEFAULT 'off' NOT NULL,
	`advisor_booking_url` text,
	`advisor_cost_credits` integer DEFAULT 100,
	`crypto_rail_enabled` integer DEFAULT false NOT NULL,
	`fund_allowlist` text,
	`overdraft_limit` integer DEFAULT 0 NOT NULL,
	`signup_grant_credits` integer DEFAULT 3 NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `background_tasks` ADD `organization_id` text REFERENCES organization(id);--> statement-breakpoint
CREATE INDEX `background_tasks_org_idx` ON `background_tasks` (`organization_id`);--> statement-breakpoint
ALTER TABLE `credit_ledger` ADD `organization_id` text REFERENCES organization(id);--> statement-breakpoint
CREATE INDEX `ledger_org_idx` ON `credit_ledger` (`organization_id`);--> statement-breakpoint
ALTER TABLE `payments` ADD `organization_id` text REFERENCES organization(id);--> statement-breakpoint
CREATE INDEX `payments_org_idx` ON `payments` (`organization_id`);--> statement-breakpoint
ALTER TABLE `simulations` ADD `organization_id` text REFERENCES organization(id);--> statement-breakpoint
ALTER TABLE `simulations` ADD `shared_with_org` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `simulations_org_idx` ON `simulations` (`organization_id`);--> statement-breakpoint
ALTER TABLE `user_assumptions` ADD `organization_id` text REFERENCES organization(id);--> statement-breakpoint
CREATE INDEX `user_assumptions_org_idx` ON `user_assumptions` (`organization_id`);--> statement-breakpoint
ALTER TABLE `user_correlations` ADD `organization_id` text REFERENCES organization(id);--> statement-breakpoint
CREATE INDEX `user_correlations_org_idx` ON `user_correlations` (`organization_id`);--> statement-breakpoint
ALTER TABLE `user_profile` ADD `organization_id` text REFERENCES organization(id);--> statement-breakpoint
CREATE INDEX `user_profile_org_idx` ON `user_profile` (`organization_id`);