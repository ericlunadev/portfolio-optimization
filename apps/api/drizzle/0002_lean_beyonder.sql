CREATE TABLE `user_profile` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`country_code` text,
	`currency` text,
	`experience` text,
	`horizon` text,
	`risk_behavior` text,
	`risk_tolerance` text,
	`goal` text,
	`markets_of_interest` text,
	`concept_familiarity` text,
	`current_step` integer DEFAULT 1 NOT NULL,
	`completed_at` integer,
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer DEFAULT (unixepoch()),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_profile_user_id_unique` ON `user_profile` (`user_id`);