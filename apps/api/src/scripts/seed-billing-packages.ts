// One-shot script: creates Stripe Products + Prices for the credit packages
// and upserts the catalog into the local credit_packages table.
//
// Usage (from apps/api):  pnpm tsx src/scripts/seed-billing-packages.ts
//
// Idempotent on the DB side (skips packages that already have a stripePriceId).
// Re-running after a price change requires deleting the credit_packages row first.

import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { creditPackages } from "../db/schema.js";
import { getStripe } from "../modules/billing/stripe.js";

type SeedPackage = {
  id: string;
  name: string;
  description: string;
  credits: number;
  priceMinor: number; // USD cents
  sortOrder: number;
};

const SEED: SeedPackage[] = [
  { id: "pack_starter", name: "Starter — 10 créditos", description: "10 corridas de optimización", credits: 10, priceMinor: 500, sortOrder: 1 },
  { id: "pack_pro", name: "Pro — 50 créditos", description: "50 corridas de optimización", credits: 50, priceMinor: 2000, sortOrder: 2 },
  { id: "pack_power", name: "Power — 200 créditos", description: "200 corridas de optimización", credits: 200, priceMinor: 7000, sortOrder: 3 },
];

async function main() {
  const stripe = getStripe();
  if (!stripe) {
    console.error("STRIPE_SECRET_KEY is not set. Cannot seed packages.");
    process.exit(1);
  }

  for (const pkg of SEED) {
    const existing = await db.query.creditPackages.findFirst({
      where: eq(creditPackages.id, pkg.id),
    });
    if (existing?.stripePriceId) {
      console.log(`✓ ${pkg.id}: already seeded (priceId=${existing.stripePriceId}), skipping`);
      continue;
    }

    console.log(`→ ${pkg.id}: creating Stripe Product + Price...`);
    const product = await stripe.products.create({
      name: pkg.name,
      description: pkg.description,
      metadata: { packageId: pkg.id },
    });
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: pkg.priceMinor,
      currency: "usd",
      metadata: { packageId: pkg.id },
    });
    console.log(`  product=${product.id} price=${price.id}`);

    if (existing) {
      await db
        .update(creditPackages)
        .set({
          credits: pkg.credits,
          priceMinor: pkg.priceMinor,
          stripePriceId: price.id,
          sortOrder: pkg.sortOrder,
          isActive: true,
        })
        .where(eq(creditPackages.id, pkg.id));
    } else {
      await db.insert(creditPackages).values({
        id: pkg.id,
        credits: pkg.credits,
        priceMinor: pkg.priceMinor,
        currency: "USD",
        rail: "stripe",
        stripePriceId: price.id,
        sortOrder: pkg.sortOrder,
        isActive: true,
      });
    }
    console.log(`✓ ${pkg.id}: seeded`);
  }

  console.log("\nDone. Set STRIPE_WEBHOOK_SECRET and start the API to accept webhooks.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
