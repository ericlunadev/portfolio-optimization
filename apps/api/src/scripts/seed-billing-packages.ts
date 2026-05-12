// One-shot script: seeds the credit_packages catalog.
//
// - Stripe rows: creates Stripe Products + Prices and stores the priceId.
// - Coinbase Commerce rows: pure DB inserts (Coinbase has no pre-created
//   products — charges are dynamic at checkout time).
//
// Usage (from apps/api):  pnpm tsx src/scripts/seed-billing-packages.ts
//
// Idempotent: Stripe rows skip if stripePriceId is already set; crypto rows
// skip if the row already exists.

import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { creditPackages } from "../db/schema.js";
import { getStripe } from "../modules/billing/stripe.js";

type FiatSeed = {
  id: string;
  name: string;
  description: string;
  credits: number;
  priceMinor: number; // USD cents
  sortOrder: number;
};

type CryptoSeed = {
  id: string;
  credits: number;
  priceMinor: number; // USD cents (Coinbase converts at checkout)
  sortOrder: number;
};

const FIAT_SEED: FiatSeed[] = [
  { id: "pack_starter", name: "Starter — 10 créditos", description: "10 corridas de optimización", credits: 10, priceMinor: 500, sortOrder: 1 },
  { id: "pack_pro", name: "Pro — 50 créditos", description: "50 corridas de optimización", credits: 50, priceMinor: 2000, sortOrder: 2 },
  { id: "pack_power", name: "Power — 200 créditos", description: "200 corridas de optimización", credits: 200, priceMinor: 7000, sortOrder: 3 },
];

const CRYPTO_SEED: CryptoSeed[] = [
  { id: "pack_starter_crypto", credits: 10, priceMinor: 500, sortOrder: 1 },
  { id: "pack_pro_crypto", credits: 50, priceMinor: 2000, sortOrder: 2 },
  { id: "pack_power_crypto", credits: 200, priceMinor: 7000, sortOrder: 3 },
];

async function seedFiat(): Promise<void> {
  const stripe = getStripe();
  if (!stripe) {
    console.warn("STRIPE_SECRET_KEY is not set. Skipping Stripe packages.");
    return;
  }

  for (const pkg of FIAT_SEED) {
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
}

async function seedCrypto(): Promise<void> {
  for (const pkg of CRYPTO_SEED) {
    const existing = await db.query.creditPackages.findFirst({
      where: eq(creditPackages.id, pkg.id),
    });
    if (existing) {
      console.log(`✓ ${pkg.id}: already seeded, skipping`);
      continue;
    }
    await db.insert(creditPackages).values({
      id: pkg.id,
      credits: pkg.credits,
      priceMinor: pkg.priceMinor,
      currency: "USD",
      rail: "coinbase_commerce",
      stripePriceId: null,
      sortOrder: pkg.sortOrder,
      isActive: true,
    });
    console.log(`✓ ${pkg.id}: seeded`);
  }
}

async function main() {
  await seedFiat();
  await seedCrypto();
  console.log("\nDone. Configure STRIPE_WEBHOOK_SECRET and COINBASE_COMMERCE_* secrets, then start the API.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
