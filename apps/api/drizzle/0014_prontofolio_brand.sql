-- The product is renamed Prontofolio and its accent moves from the house gold
-- (#d7a042) to Azul Eléctrico (#2563ff), with Space Grotesk as the display face.
--
-- Only rows still carrying the values migration 0008 and `provisionOrganizationForUser`
-- (apps/api/src/lib/auth.ts) seeded are touched: the default tenant and every
-- personal organization. A tenant who has set their own product name, accent or
-- font keeps it. Personal organizations matter as much as the default tenant here:
-- charts and the PDF read the signed-in user's organization branding, so a stale
-- gold accent on those rows would keep painting the house charts gold.
UPDATE `organization_branding`
SET `product_name` = 'Prontofolio',
    `product_short_name` = NULL,
    `updated_at` = unixepoch()
WHERE `product_name` = 'Optimización de Portafolio'
  AND `product_short_name` = 'Optim.';
--> statement-breakpoint
UPDATE `organization_branding`
SET `accent_hex` = '#2563ff',
    `updated_at` = unixepoch()
WHERE `product_name` = 'Prontofolio'
  AND `accent_hex` = '#d7a042';
--> statement-breakpoint
UPDATE `organization_branding`
SET `font_key` = 'space-grotesk',
    `updated_at` = unixepoch()
WHERE `product_name` = 'Prontofolio'
  AND `font_key` = 'instrument-sans';
--> statement-breakpoint
UPDATE `organization`
SET `name` = 'Prontofolio'
WHERE `is_default` = 1
  AND `name` = 'Optimización de Portafolio';
