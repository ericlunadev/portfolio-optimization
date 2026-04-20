CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `background_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`task_type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`progress` real DEFAULT 0,
	`result_data` text,
	`error_message` text,
	`created_at` integer DEFAULT (unixepoch()),
	`started_at` integer,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `fund_exposures` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`portfolio_code` text NOT NULL,
	`m_rating` text,
	`rating` text,
	`ticker` text,
	`mv_pct` real,
	`as_of_date` text
);
--> statement-breakpoint
CREATE INDEX `exposure_portfolio_idx` ON `fund_exposures` (`portfolio_code`);--> statement-breakpoint
CREATE TABLE `funds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`long_name` text,
	`yahoo_ticker` text,
	`portfolio_code` text,
	`exp_ret` real DEFAULT 0.05,
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `funds_name_unique` ON `funds` (`name`);--> statement-breakpoint
CREATE INDEX `fund_name_idx` ON `funds` (`name`);--> statement-breakpoint
CREATE TABLE `index_data` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`security` text NOT NULL,
	`date` text NOT NULL,
	`value` real NOT NULL
);
--> statement-breakpoint
CREATE INDEX `index_security_idx` ON `index_data` (`security`);--> statement-breakpoint
CREATE UNIQUE INDEX `index_unique` ON `index_data` (`security`,`date`);--> statement-breakpoint
CREATE TABLE `key_figures` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`portfolio_code` text NOT NULL,
	`figure_key` text NOT NULL,
	`value` real,
	`as_of_date` text
);
--> statement-breakpoint
CREATE INDEX `key_figures_portfolio_idx` ON `key_figures` (`portfolio_code`);--> statement-breakpoint
CREATE TABLE `prices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fund_id` integer NOT NULL,
	`date` text NOT NULL,
	`price` real NOT NULL,
	FOREIGN KEY (`fund_id`) REFERENCES `funds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `price_fund_idx` ON `prices` (`fund_id`);--> statement-breakpoint
CREATE INDEX `price_date_idx` ON `prices` (`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `price_unique` ON `prices` (`fund_id`,`date`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE `simulations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`params` text NOT NULL,
	`result` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `user_assumptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`fund_id` integer NOT NULL,
	`exp_ret` real,
	`volatility` real,
	`updated_at` integer DEFAULT (unixepoch()),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`fund_id`) REFERENCES `funds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_fund_unique` ON `user_assumptions` (`user_id`,`fund_id`);--> statement-breakpoint
CREATE TABLE `user_correlations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`fund_id_1` integer NOT NULL,
	`fund_id_2` integer NOT NULL,
	`correlation` real NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`fund_id_1`) REFERENCES `funds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fund_id_2`) REFERENCES `funds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_corr_unique` ON `user_correlations` (`user_id`,`fund_id_1`,`fund_id_2`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
