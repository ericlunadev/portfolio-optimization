-- The Prontofolio logo is the two-tone compound "pronto|folio": the web
-- wordmark splits a one-word product name where its short name ends
-- (apps/web/src/lib/wordmark.ts, rule 3).
--
-- Migration 0014 left the house rows with `product_short_name` NULL. Only those
-- rows are touched — the default tenant and every personal organization, which
-- still carry the house product name with no short name of their own. A tenant
-- who set a short name keeps it.
UPDATE `organization_branding`
SET `product_short_name` = 'Pronto',
    `updated_at` = unixepoch()
WHERE `product_name` = 'Prontofolio'
  AND `product_short_name` IS NULL;
