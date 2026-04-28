DROP INDEX "exposure_portfolio_idx";--> statement-breakpoint
DROP INDEX "funds_name_unique";--> statement-breakpoint
DROP INDEX "fund_name_idx";--> statement-breakpoint
DROP INDEX "index_security_idx";--> statement-breakpoint
DROP INDEX "index_unique";--> statement-breakpoint
DROP INDEX "key_figures_portfolio_idx";--> statement-breakpoint
DROP INDEX "price_fund_idx";--> statement-breakpoint
DROP INDEX "price_date_idx";--> statement-breakpoint
DROP INDEX "price_unique";--> statement-breakpoint
DROP INDEX "session_token_unique";--> statement-breakpoint
DROP INDEX "user_email_unique";--> statement-breakpoint
DROP INDEX "user_fund_unique";--> statement-breakpoint
DROP INDEX "user_corr_unique";--> statement-breakpoint
ALTER TABLE `simulations` ALTER COLUMN "name" TO "name" text;--> statement-breakpoint
CREATE INDEX `exposure_portfolio_idx` ON `fund_exposures` (`portfolio_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `funds_name_unique` ON `funds` (`name`);--> statement-breakpoint
CREATE INDEX `fund_name_idx` ON `funds` (`name`);--> statement-breakpoint
CREATE INDEX `index_security_idx` ON `index_data` (`security`);--> statement-breakpoint
CREATE UNIQUE INDEX `index_unique` ON `index_data` (`security`,`date`);--> statement-breakpoint
CREATE INDEX `key_figures_portfolio_idx` ON `key_figures` (`portfolio_code`);--> statement-breakpoint
CREATE INDEX `price_fund_idx` ON `prices` (`fund_id`);--> statement-breakpoint
CREATE INDEX `price_date_idx` ON `prices` (`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `price_unique` ON `prices` (`fund_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_fund_unique` ON `user_assumptions` (`user_id`,`fund_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_corr_unique` ON `user_correlations` (`user_id`,`fund_id_1`,`fund_id_2`);