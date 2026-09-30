-- Scheduled reports become tenant-scoped (#46).
--
-- `simulation_schedules` predates multi-tenancy (#44 landed on top of #31), so it
-- has a `user_id` and no `organization_id`. This adds the column NOT NULL, stamps
-- every existing schedule with its owner's organization, and installs ON DELETE
-- cascade.
--
-- Hand-written, not generated. drizzle-kit emits
-- `ALTER TABLE ... ADD organization_id text NOT NULL REFERENCES organization(id)`,
-- which libSQL rejects on a populated table ("Cannot add a NOT NULL column with
-- default value NULL") while succeeding on an empty dev database, and whose
-- ADD COLUMN form silently drops the declared cascade (see 0007). A table rebuild
-- does both jobs in one migration: the backfill happens in the INSERT ... SELECT,
-- so there is no nullable window and no second deploy.
--
-- The owner's organization comes from `organization_member`, which is UNIQUE on
-- `user_id` (one user, one organization), so the subquery returns one row at most.
--
-- A schedule whose owner has no membership row is DROPPED. Such an owner is the
-- data-integrity bug `authMiddleware` answers with a 500 on every request, so they
-- can neither see nor manage the schedule, and the runner already skipped it
-- ("has no organization_member row — skipping"). There is no organization to
-- stamp it with that would not be a guess. Count them before running this
-- against production:
--   SELECT count(*) FROM simulation_schedules s
--   WHERE NOT EXISTS (SELECT 1 FROM organization_member m WHERE m.user_id = s.user_id);
--
-- Foreign keys are off for the rebuild (the libSQL migrator disables them, and
-- the PRAGMA below says so for anything else), so dropping the old table does not
-- cascade into `schedule_simulations` or `simulation_runs`. That also means a
-- dropped schedule's children are NOT cleaned up by the database, so the two
-- statements after the rename do by hand what the declared actions would have
-- done: cascade the links, set null on the run history.
--
-- Deploy window: the release still serving traffic while this runs inserts
-- schedules without `organization_id`, and those inserts fail until the new
-- release is live. Creating a schedule during a deploy errors instead of writing
-- a row nobody's tenant could see.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_simulation_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`name` text,
	`cadence` text NOT NULL,
	`day_of_week` integer,
	`day_of_month` integer,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`locale` text DEFAULT 'es' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`next_run_at` integer NOT NULL,
	`last_run_at` integer,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer DEFAULT (unixepoch()),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_simulation_schedules`("id", "user_id", "organization_id", "name", "cadence", "day_of_week", "day_of_month", "timezone", "locale", "active", "next_run_at", "last_run_at", "consecutive_failures", "created_at", "updated_at")
SELECT s."id", s."user_id", m."organization_id", s."name", s."cadence", s."day_of_week", s."day_of_month", s."timezone", s."locale", s."active", s."next_run_at", s."last_run_at", s."consecutive_failures", s."created_at", s."updated_at"
FROM `simulation_schedules` s
INNER JOIN `organization_member` m ON m."user_id" = s."user_id";
--> statement-breakpoint
DROP TABLE `simulation_schedules`;--> statement-breakpoint
ALTER TABLE `__new_simulation_schedules` RENAME TO `simulation_schedules`;--> statement-breakpoint
DELETE FROM `schedule_simulations` WHERE `schedule_id` NOT IN (SELECT `id` FROM `simulation_schedules`);--> statement-breakpoint
UPDATE `simulation_runs` SET `schedule_id` = NULL WHERE `schedule_id` IS NOT NULL AND `schedule_id` NOT IN (SELECT `id` FROM `simulation_schedules`);--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `simulation_schedules_due_idx` ON `simulation_schedules` (`active`,`next_run_at`);--> statement-breakpoint
CREATE INDEX `simulation_schedules_user_idx` ON `simulation_schedules` (`user_id`);--> statement-breakpoint
CREATE INDEX `simulation_schedules_org_idx` ON `simulation_schedules` (`organization_id`);
