// The fund allowlist has to be an enforcement boundary, not a search filter.
//
// Filtering the ticker picker stops an analyst stumbling onto an instrument their
// firm has not approved. It does nothing about posting that instrument straight
// to /api/optimization with curl, or reaching it through any UI path that skips
// the picker — which for a compliance control is the case that matters.

import { describe, expect, it } from "vitest";
import { asUser, seedOrg, seedUser } from "../../test/factories.js";

const BODY = {
  strategy: "max-sharpe",
  start_date: "2020-01-01",
  end_date: "2023-12-31",
};

describe("fund allowlist enforcement on the optimizer", () => {
  it("refuses a ticker outside the tenant's allowlist", async () => {
    const org = await seedOrg({ fundAllowlist: JSON.stringify(["SPY", "AGG"]) });
    const analyst = await seedUser({ organizationId: org.id });

    const response = await asUser(analyst)("/api/optimization/optimize", {
      method: "POST",
      json: { ...BODY, tickers: ["SPY", "TSLA"] },
    });

    expect(response.status).toBe(400);
    const body = await response.text();
    expect(body).toContain("TSLA");
    // The approved one must not be named in a refusal.
    expect(body).not.toContain("SPY");
  });

  it("does not charge a credit for a refused request", async () => {
    const org = await seedOrg({ fundAllowlist: JSON.stringify(["SPY"]) });
    const analyst = await seedUser({ organizationId: org.id });

    const before = await asUser(analyst)("/api/billing/wallet");
    const creditsBefore = ((await before.json()) as { credits: number }).credits;

    await asUser(analyst)("/api/optimization/optimize", {
      method: "POST",
      json: { ...BODY, tickers: ["TSLA"] },
    });

    const after = await asUser(analyst)("/api/billing/wallet");
    const creditsAfter = ((await after.json()) as { credits: number }).credits;
    expect(creditsAfter).toBe(creditsBefore);
  });

  it("lets one tenant's allowlist through while refusing another's ticker", async () => {
    // Different allowlists, not one restricted and one open: a guard that read
    // whichever settings row it found first would still pass the weaker test.
    const orgA = await seedOrg({ fundAllowlist: JSON.stringify(["TSLA"]) });
    const orgB = await seedOrg({ fundAllowlist: JSON.stringify(["SPY"]) });
    const analystA = await seedUser({ organizationId: orgA.id });
    const analystB = await seedUser({ organizationId: orgB.id });

    const refusedForB = await asUser(analystB)("/api/optimization/optimize", {
      method: "POST",
      json: { ...BODY, tickers: ["TSLA"] },
    });
    expect(refusedForB.status).toBe(400);

    // The same ticker is approved for A, so it must get past the guard. It may
    // still fail downstream on market data, which is not what is under test.
    const allowedForA = await asUser(analystA)("/api/optimization/optimize", {
      method: "POST",
      json: { ...BODY, tickers: ["TSLA"] },
    });
    expect(allowedForA.status).not.toBe(400);
  });

  it("leaves a tenant with no allowlist unrestricted", async () => {
    const org = await seedOrg();
    const analyst = await seedUser({ organizationId: org.id });

    const response = await asUser(analyst)("/api/optimization/optimize", {
      method: "POST",
      json: { ...BODY, tickers: ["TSLA"] },
    });
    expect(response.status).not.toBe(400);
  });
});
