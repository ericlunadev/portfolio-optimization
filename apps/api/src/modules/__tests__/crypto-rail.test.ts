// PLAN Task 2.7 — the crypto rail is a per-tenant switch.
//
// A corporate finance department pays by card or on an invoice, so a "Pay with
// crypto" tab is noise in a whitelabel app and, in a regulated firm, a
// conversation nobody wants to have. `organization_settings.crypto_rail_enabled`
// decides, and it defaults to false: a tenant is opted in deliberately or not
// at all.
//
// The UI hiding the tab is the cosmetic half. What is tested here is the half
// that matters: a caller who ignores the UI and posts to the checkout endpoint
// anyway is refused, and the gated rail's packages never reach them either.

import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db/index.js";
import { creditPackages, payments } from "../../db/schema.js";
import { asAnonymous, asUser, seedOrg, seedUser, type SeededUser } from "../../test/factories.js";

type PackageResponse = { id: string; rail: string }[];

const STRIPE_PACKAGE = "pack_test_stripe";
const CRYPTO_PACKAGE = "pack_test_crypto";

/**
 * One package per rail, so "the crypto one is missing" is distinguishable from
 * "there are none". `credit_packages` is a platform table with no
 * `organization_id`, so these rows are seeded once for the whole file rather
 * than per test.
 */
async function seedPackages(): Promise<void> {
  await db.insert(creditPackages).values([
    {
      id: STRIPE_PACKAGE,
      credits: 10,
      priceMinor: 500,
      currency: "usd",
      rail: "stripe",
      stripePriceId: "price_test",
      sortOrder: 1,
    },
    {
      id: CRYPTO_PACKAGE,
      credits: 10,
      priceMinor: 500,
      currency: "usd",
      rail: "coinbase_commerce",
      sortOrder: 2,
    },
  ]);
}

async function seedTenant(cryptoRailEnabled: boolean): Promise<SeededUser> {
  const org = await seedOrg({ cryptoRailEnabled });
  return seedUser({ organizationId: org.id });
}

async function rails(analyst: SeededUser): Promise<string[]> {
  const res = await asUser(analyst)("/api/billing/rails");
  expect(res.status).toBe(200);
  return ((await res.json()) as { rails: string[] }).rails;
}

async function packages(analyst: SeededUser, query = ""): Promise<PackageResponse> {
  const res = await asUser(analyst)(`/api/billing/packages${query}`);
  expect(res.status).toBe(200);
  return (await res.json()) as PackageResponse;
}

beforeAll(async () => {
  await seedPackages();
});

describe("GET /api/billing/rails", () => {
  it("requires a session — the answer is per organization", async () => {
    const res = await asAnonymous()("/api/billing/rails");
    expect(res.status).toBe(401);
  });

  it("offers card only when the organization has the crypto rail off", async () => {
    expect(await rails(await seedTenant(false))).toEqual(["stripe"]);
  });

  it("offers both rails when the organization has it on", async () => {
    expect(await rails(await seedTenant(true))).toEqual(["stripe", "coinbase_commerce"]);
  });

  it("answers per organization, not per deployment", async () => {
    const [gated, opted] = [await seedTenant(false), await seedTenant(true)];

    expect(await rails(gated)).toEqual(["stripe"]);
    expect(await rails(opted)).toEqual(["stripe", "coinbase_commerce"]);
  });
});

describe("GET /api/billing/packages", () => {
  it("omits crypto packages from the unfiltered list when the rail is off", async () => {
    const rows = await packages(await seedTenant(false));

    expect(rows.map((r) => r.id)).toEqual([STRIPE_PACKAGE]);
  });

  it("returns nothing for an explicitly requested rail the organization does not have", async () => {
    const rows = await packages(await seedTenant(false), "?rail=coinbase_commerce");

    expect(rows).toEqual([]);
  });

  it("still serves the card rail to an organization with crypto off", async () => {
    const rows = await packages(await seedTenant(false), "?rail=stripe");

    expect(rows.map((r) => r.id)).toEqual([STRIPE_PACKAGE]);
  });

  it("serves both rails to an organization that has crypto on", async () => {
    const rows = await packages(await seedTenant(true));

    expect(rows.map((r) => r.id).sort()).toEqual([CRYPTO_PACKAGE, STRIPE_PACKAGE]);
  });
});

describe("POST /api/billing/crypto/checkout", () => {
  it("refuses when the organization has the rail off, whatever the UI shows", async () => {
    const analyst = await seedTenant(false);

    const res = await asUser(analyst)("/api/billing/crypto/checkout", {
      method: "POST",
      json: { packageId: CRYPTO_PACKAGE },
    });

    expect(res.status).toBe(404);
    // Nothing was staged: a refused rail must not leave a pending payment row
    // that a webhook could later fulfil.
    expect(await db.select().from(payments)).toHaveLength(0);
  });

  it("gets past the tenant gate when the rail is on", async () => {
    const analyst = await seedTenant(true);

    const res = await asUser(analyst)("/api/billing/crypto/checkout", {
      method: "POST",
      json: { packageId: CRYPTO_PACKAGE },
    });

    // 503 because the test process holds no Coinbase credentials. That the
    // request reached the platform's configuration check at all is what proves
    // the tenant's own gate let it through — the two are deliberately ordered
    // that way, since our credentials are irrelevant to a tenant without the rail.
    expect(res.status).toBe(503);
  });

  it("does not let a gated organization spend another tenant's rail", async () => {
    const gated = await seedTenant(false);
    await seedTenant(true);

    const res = await asUser(gated)("/api/billing/crypto/checkout", {
      method: "POST",
      json: { packageId: CRYPTO_PACKAGE },
    });

    expect(res.status).toBe(404);
  });
});

describe("the card rail is never gated", () => {
  it("keeps the Stripe package visible to an organization with crypto off", async () => {
    const analyst = await seedTenant(false);
    const row = await db.query.creditPackages.findFirst({
      where: eq(creditPackages.id, STRIPE_PACKAGE),
    });

    expect(row?.isActive).toBe(true);
    expect((await packages(analyst)).map((r) => r.rail)).toEqual(["stripe"]);
  });
});
