-- Whitelabel tenancy, migration (D-ii) — Deploy 1. The wallet re-key, step 2 of 2.
--
-- Drives the backfill from `organization` through `organization_member`, not from
-- `wallet_balance`, so an organization whose owner never had a wallet row still
-- ends up with one. Migration (C) makes `organization_id` NOT NULL UNIQUE, so
-- both invariants below have to hold before Deploy 2: no wallet row without an
-- organization, and no organization with two wallet rows.
--
-- (1) Stamp the existing per-user wallet rows.
UPDATE `wallet_balance` SET `organization_id` = (
	SELECT m.`organization_id` FROM `organization_member` m WHERE m.`user_id` = `wallet_balance`.`user_id`
) WHERE `organization_id` IS NULL;
--> statement-breakpoint
-- (2) Give every organization that has members but no wallet row an empty one,
--     keyed on its earliest member because `user_id` is still the NOT NULL primary
--     key until (C). An organization with no members at all — the default D2C
--     tenant, which exists only to own the hostname — cannot get a row yet; (C)
--     creates it once `user_id` is nullable. Nothing depends on it before then:
--     ensureWalletRow() in spend.ts creates the row on first use anyway.
INSERT INTO `wallet_balance` (`user_id`, `organization_id`, `credits`, `updated_at`)
SELECT (
		SELECT m.`user_id` FROM `organization_member` m
		WHERE m.`organization_id` = o.`id`
		ORDER BY m.`created_at`, m.`id` LIMIT 1
	), o.`id`, 0, unixepoch()
FROM `organization` o
WHERE EXISTS (SELECT 1 FROM `organization_member` m WHERE m.`organization_id` = o.`id`)
  AND NOT EXISTS (SELECT 1 FROM `wallet_balance` w WHERE w.`organization_id` = o.`id`);
--> statement-breakpoint
-- (3) Guard. `_wallet_backfill_guard.x` is NOT NULL, so either INSERT below fails
--     — aborting the migration — if its condition matches a row. The leading
--     DROP ... IF EXISTS matters: when the guard fires, the migration stops before
--     its own DROP at the end, so a retry would otherwise die at CREATE TABLE with
--     an unrelated error.
DROP TABLE IF EXISTS `_wallet_backfill_guard`;
--> statement-breakpoint
CREATE TABLE `_wallet_backfill_guard` (`x` text NOT NULL);
--> statement-breakpoint
-- A wallet row with no organization would be rejected by (C)'s table rebuild.
INSERT INTO `_wallet_backfill_guard` (`x`) SELECT NULL FROM `wallet_balance` WHERE `organization_id` IS NULL LIMIT 1;
--> statement-breakpoint
-- Two wallets mapping to one organization would be rejected by (C)'s UNIQUE, and
-- would mean two balances silently competing for the same tenant's credits.
INSERT INTO `_wallet_backfill_guard` (`x`) SELECT NULL FROM `wallet_balance` WHERE `organization_id` IS NOT NULL GROUP BY `organization_id` HAVING count(*) > 1 LIMIT 1;
--> statement-breakpoint
DROP TABLE `_wallet_backfill_guard`;
