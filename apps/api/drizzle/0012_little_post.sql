CREATE TABLE `schedule_simulations` (
	`schedule_id` text NOT NULL,
	`simulation_id` text NOT NULL,
	FOREIGN KEY (`schedule_id`) REFERENCES `simulation_schedules`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`simulation_id`) REFERENCES `simulations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `schedule_simulations_simulation_idx` ON `schedule_simulations` (`simulation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `schedule_simulation_unique` ON `schedule_simulations` (`schedule_id`,`simulation_id`);--> statement-breakpoint
CREATE TABLE `simulation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`simulation_id` text NOT NULL,
	`schedule_id` text,
	`params` text NOT NULL,
	`result` text,
	`status` text NOT NULL,
	`error_message` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`simulation_id`) REFERENCES `simulations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`schedule_id`) REFERENCES `simulation_schedules`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `simulation_runs_simulation_idx` ON `simulation_runs` (`simulation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `simulation_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
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
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `simulation_schedules_due_idx` ON `simulation_schedules` (`active`,`next_run_at`);--> statement-breakpoint
CREATE INDEX `simulation_schedules_user_idx` ON `simulation_schedules` (`user_id`);