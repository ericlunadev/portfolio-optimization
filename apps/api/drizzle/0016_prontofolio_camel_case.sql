-- The product name is written "ProntoFolio", with the P and the F capitalised:
-- the web wordmark now keeps the name's own casing instead of lowercasing it,
-- and the split it already makes at the short name "Pronto" lands on the F.
--
-- Only rows still carrying the house name are touched — the default tenant and
-- every personal organization, as in migrations 0014 and 0015. SQLite's `=` is
-- case-sensitive, so a tenant who named themselves anything else keeps it.
UPDATE `organization_branding`
SET `product_name` = 'ProntoFolio',
    `updated_at` = unixepoch()
WHERE `product_name` = 'Prontofolio';
--> statement-breakpoint
UPDATE `organization`
SET `name` = 'ProntoFolio'
WHERE `is_default` = 1
  AND `name` = 'Prontofolio';
