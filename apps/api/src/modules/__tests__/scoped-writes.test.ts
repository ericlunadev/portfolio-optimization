// The write half of tenancy, which the isolation suite does not reach.
//
// Those tests seed their rows directly, so they prove reads are scoped without
// ever exercising the INSERTs that stamp `organization_id` in the first place, or
// the settings lookup that decides how many credits a signup is granted. A
// mutation pass found both: pointing the simulations INSERT at an arbitrary
// organization, and deleting the org predicate from `resolveSignupGrant`, each
// left the whole suite green.

import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "../../db/index.js";
import { creditLedger, simulations, userProfile } from "../../db/schema.js";
import { asUser, seedOrg, seedUser } from "../../test/factories.js";

const PARAMS = { tickers: ["SPY"], strategy: "max-sharpe" };
const RESULT = { weights: { SPY: 1 }, expectedReturn: 0.07 };

describe("POST /api/simulations", () => {
  it("stamps the caller's organization, not another one", async () => {
    // A second org exists and sorts first, so a query that ignores the caller
    // has something wrong to find.
    await seedOrg({ id: "org-aaa-decoy" });
    const orgB = await seedOrg({ id: "org-bbb-caller" });
    const analyst = await seedUser({ organizationId: orgB.id });

    const response = await asUser(analyst)("/api/simulations", {
      method: "POST",
      json: { name: "quarterly review", params: PARAMS, result: RESULT },
    });
    expect(response.status).toBe(201);
    const { id } = (await response.json()) as { id: string };

    const row = await db.query.simulations.findFirst({
      where: eq(simulations.id, id),
    });
    expect(row?.organizationId).toBe(orgB.id);
    expect(row?.userId).toBe(analyst.id);
    expect(row?.sharedWithOrg).toBe(false);
  });

  it("hides a freshly created simulation from another organization", async () => {
    const orgA = await seedOrg();
    const orgB = await seedOrg();
    const analystA = await seedUser({ organizationId: orgA.id });
    const analystB = await seedUser({ organizationId: orgB.id });

    const created = await asUser(analystA)("/api/simulations", {
      method: "POST",
      json: { name: "private", params: PARAMS, result: RESULT },
    });
    const { id } = (await created.json()) as { id: string };

    // 404 rather than 403: existence must not leak across tenants.
    const seen = await asUser(analystB)(`/api/simulations/${id}`);
    expect(seen.status).toBe(404);
  });
});

describe("POST /api/onboarding/complete", () => {
  // The grant is paid out of the wallet the tenant is invoiced for, so reading
  // another org's `signup_grant_credits` spends their configuration on our books.
  it("grants from the caller's organization settings", async () => {
    const orgA = await seedOrg({ signupGrantCredits: 7 });
    const orgB = await seedOrg({ signupGrantCredits: 0 });
    const analystA = await seedUser({ organizationId: orgA.id });
    const analystB = await seedUser({ organizationId: orgB.id });

    await completeOnboarding(analystA);
    await completeOnboarding(analystB);

    expect(await grantedTo(orgA.id)).toBe(7);
    // A whitelabel tenant switches the grant off; it must not fall back to the
    // module constant or to the other org's value.
    expect(await grantedTo(orgB.id)).toBe(0);
  });
});

async function completeOnboarding(analyst: {
  id: string;
  organizationId: string;
  sessionToken: string;
  name: string;
  email: string;
}): Promise<void> {
  await db.insert(userProfile).values({
    userId: analyst.id,
    organizationId: analyst.organizationId,
    countryCode: "AR",
    currency: "USD",
    experience: "intermediate",
    horizon: "long",
    riskBehavior: "hold",
    riskTolerance: "medium",
    goal: "growth",
    marketsOfInterest: JSON.stringify(["BYMA"]),
    conceptFamiliarity: JSON.stringify(["markowitz"]),
    currentStep: 3,
  });

  const response = await asUser(analyst)("/api/onboarding/complete", {
    method: "POST",
  });
  expect(response.status).toBe(200);
}

async function grantedTo(organizationId: string): Promise<number> {
  const rows = await db
    .select()
    .from(creditLedger)
    .where(
      and(
        eq(creditLedger.organizationId, organizationId),
        eq(creditLedger.reason, "grant")
      )
    );
  return rows.reduce((sum, row) => sum + row.delta, 0);
}
