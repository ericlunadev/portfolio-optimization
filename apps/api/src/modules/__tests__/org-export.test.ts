// Task 3.6. A departing tenant asks for their data and the contract usually
// obliges us to hand it over — which makes this the one endpoint that returns
// every scoped table at once, and therefore the one whose org predicates are
// worth the most to an attacker. Two properties matter: nothing from another
// tenant comes back, and a plain member cannot trigger it at all.

import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "../../db/index.js";
import { creditLedger, organizationBranding, walletBalance } from "../../db/schema.js";
import {
  asAnonymous,
  asUser,
  seedOrg,
  seedProfile,
  seedSimulation,
  seedTask,
  seedUser,
  type SeededOrg,
  type SeededUser,
} from "../../test/factories.js";

type ExportBody = {
  format: string;
  organization: { id: string };
  members: { userId: string; email: string; role: string }[];
  branding: { disclaimerText: string | null } | null;
  settings: { signupGrantCredits: number } | null;
  simulations: { id: string; organizationId: string }[];
  userProfiles: { organizationId: string }[];
  backgroundTasks: { organizationId: string }[];
  walletBalance: { organizationId: string; credits: number } | null;
  creditLedger: { id: string; organizationId: string }[];
};

/** An organization carrying one row in every table the export reads. */
async function seedTenant(
  options: { signupGrantCredits?: number; disclaimerText?: string } = {}
): Promise<{ org: SeededOrg; owner: SeededUser; ledgerId: string }> {
  const org = await seedOrg({ signupGrantCredits: options.signupGrantCredits ?? 3 });
  const owner = await seedUser({ organizationId: org.id, role: "owner" });

  await db.insert(organizationBranding).values({
    organizationId: org.id,
    disclaimerText: options.disclaimerText ?? null,
  });
  await db.insert(walletBalance).values({ organizationId: org.id, credits: 42 });

  const ledgerId = randomUUID();
  await db.insert(creditLedger).values({
    id: ledgerId,
    organizationId: org.id,
    userId: owner.id,
    delta: 42,
    reason: "grant",
    balanceAfter: 42,
  });

  await seedSimulation({ organizationId: org.id, userId: owner.id });
  await seedProfile({ organizationId: org.id, userId: owner.id });
  await seedTask({ organizationId: org.id, userId: owner.id });

  return { org, owner, ledgerId };
}

describe("GET /api/organizations/export", () => {
  it("returns the caller's organization and nothing from another tenant", async () => {
    const mine = await seedTenant({ signupGrantCredits: 7, disclaimerText: "Ours." });
    const theirs = await seedTenant({ signupGrantCredits: 11, disclaimerText: "Theirs." });

    const res = await asUser(mine.owner)("/api/organizations/export");
    expect(res.status).toBe(200);
    const body = (await res.json()) as ExportBody;

    expect(body.format).toBe("organization-export/1");
    expect(body.organization.id).toBe(mine.org.id);
    expect(body.branding?.disclaimerText).toBe("Ours.");
    expect(body.settings?.signupGrantCredits).toBe(7);
    expect(body.walletBalance?.credits).toBe(42);

    // Every collection is stamped to the caller's organization, so a dropped
    // predicate on any one table shows up here rather than in production.
    const stamps = [
      ...body.simulations,
      ...body.userProfiles,
      ...body.backgroundTasks,
      ...body.creditLedger,
    ].map((row) => row.organizationId);
    expect(stamps).toHaveLength(4);
    expect(new Set(stamps)).toEqual(new Set([mine.org.id]));
    expect(body.creditLedger.map((row) => row.id)).not.toContain(theirs.ledgerId);
  });

  it("names each seat behind its membership row", async () => {
    const { org, owner } = await seedTenant();
    const analyst = await seedUser({ organizationId: org.id, role: "member" });

    const body = (await (
      await asUser(owner)("/api/organizations/export")
    ).json()) as ExportBody;

    expect(body.members.map((m) => m.userId).sort()).toEqual([owner.id, analyst.id].sort());
    expect(body.members.find((m) => m.userId === analyst.id)).toMatchObject({
      email: analyst.email,
      role: "member",
    });
  });

  it("refuses a member who is not an owner", async () => {
    const { org } = await seedTenant();
    const analyst = await seedUser({ organizationId: org.id, role: "member" });

    const res = await asUser(analyst)("/api/organizations/export");

    expect(res.status).toBe(403);
  });

  it("does not let an owner of one tenant export another", async () => {
    // The role check reads the membership row for *this* organization, so an
    // owner elsewhere is a plain stranger here.
    const theirs = await seedTenant();
    const outsider = await seedUser({ role: "owner" });

    const body = (await (
      await asUser(outsider)("/api/organizations/export")
    ).json()) as ExportBody;

    expect(body.organization.id).not.toBe(theirs.org.id);
    expect(body.simulations).toEqual([]);
  });

  it("requires a session", async () => {
    const res = await asAnonymous()("/api/organizations/export");

    expect(res.status).toBe(401);
  });

  it("offers the dump as a download", async () => {
    const { owner } = await seedTenant();

    const res = await asUser(owner)("/api/organizations/export");

    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="/);
  });
});

describe("GET /api/organizations/branding", () => {
  it("returns the caller's own disclaimer wording", async () => {
    const mine = await seedTenant({ disclaimerText: "Ours." });
    await seedTenant({ disclaimerText: "Theirs." });

    const res = await asUser(mine.owner)("/api/organizations/branding");

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      organizationId: mine.org.id,
      disclaimerText: "Ours.",
    });
  });

  it("answers with nulls when the tenant has no branding row", async () => {
    const org = await seedOrg();
    const analyst = await seedUser({ organizationId: org.id, role: "member" });

    const res = await asUser(analyst)("/api/organizations/branding");

    // Not an error: the client falls back to our default wording.
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ disclaimerText: null });
  });

  it("requires a session", async () => {
    const res = await asAnonymous()("/api/organizations/branding");

    expect(res.status).toBe(401);
  });
});
