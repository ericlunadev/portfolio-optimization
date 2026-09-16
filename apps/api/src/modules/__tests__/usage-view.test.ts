// PLAN Task 2.4 — the owner's usage view.
//
// D7 gave the organization one shared wallet with per-user attribution in the
// ledger, which leaves the owner invoiced for a number they cannot break down.
// This endpoint is the breakdown, and the decision it encodes is deliberate:
//
//   * `GET /api/billing/usage` is **org-wide, owner only**. It is the only view
//     whose deltas reconcile with the org-wide balance, and an owner is the only
//     person entitled to see what their colleagues spend.
//   * `GET /api/billing/ledger` stays **personal, for everyone**. A member reads
//     their own rows, exactly as before — asserted here so the split does not
//     drift back together by accident.
//   * Rows with no user (`user_id` set null when an analyst is deleted, and
//     every operator grant) count towards the wallet and appear in nobody's
//     personal ledger. They get a row of their own here, which is what makes the
//     owner's numbers add up.

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/index.js";
import { walletBalance } from "../../db/schema.js";
import { grantCredits, spendCredit } from "../../lib/billing/spend.js";
import {
  asAnonymous,
  asUser,
  seedOrg,
  seedSimulation,
  seedUser,
  type SeededOrg,
  type SeededUser,
} from "../../test/factories.js";

type UsageMember = {
  userId: string | null;
  name: string | null;
  email: string | null;
  role: string | null;
  isCurrentMember: boolean;
  spent: number;
  added: number;
  runs: number;
  simulations: number;
  lastActivityAt: string | null;
};

type UsageBody = {
  totals: {
    balance: number;
    spent: number;
    added: number;
    runs: number;
    simulations: number;
    seats: number;
  };
  members: UsageMember[];
  recent: {
    id: string;
    delta: number;
    reason: string;
    balanceAfter: number;
    actor: { userId: string; name: string | null } | null;
  }[];
};

type Tenant = { org: SeededOrg; owner: SeededUser; analyst: SeededUser };

/**
 * An organization with two seats, an operator grant behind its balance, and one
 * metered run per seat — the smallest fixture in which "who spent what" has a
 * non-trivial answer.
 */
async function seedTenant(prefix: string): Promise<Tenant> {
  const org = await seedOrg({ name: `${prefix} Capital` });
  const owner = await seedUser({ organizationId: org.id, role: "owner", name: `${prefix} owner` });
  const analyst = await seedUser({
    organizationId: org.id,
    role: "member",
    name: `${prefix} analyst`,
  });

  // No acting user: this is the operator grant of Task 2.3.
  await grantCredits({
    organizationId: org.id,
    userId: null,
    credits: 100,
    reason: "grant",
    idempotencyKey: `grant:${prefix}`,
  });

  await spendCredit({
    organizationId: org.id,
    userId: owner.id,
    idempotencyKey: `${prefix}:owner-run`,
    cost: 3,
  });
  await spendCredit({
    organizationId: org.id,
    userId: analyst.id,
    idempotencyKey: `${prefix}:analyst-run`,
    cost: 5,
  });

  await seedSimulation({ organizationId: org.id, userId: owner.id });
  await seedSimulation({ organizationId: org.id, userId: analyst.id });
  await seedSimulation({ organizationId: org.id, userId: analyst.id });

  return { org, owner, analyst };
}

async function readUsage(caller: SeededUser, query = ""): Promise<UsageBody> {
  const res = await asUser(caller)(`/api/billing/usage${query}`);
  expect(res.status).toBe(200);
  return (await res.json()) as UsageBody;
}

function memberFor(body: UsageBody, userId: string | null): UsageMember {
  const row = body.members.find((m) => m.userId === userId);
  expect(row).toBeDefined();
  return row as UsageMember;
}

let tenant: Tenant;

beforeEach(async () => {
  tenant = await seedTenant(`t${Math.random().toString(36).slice(2, 8)}`);
});

describe("GET /api/billing/usage — who may read it", () => {
  it("requires a session", async () => {
    const res = await asAnonymous()("/api/billing/usage");
    expect(res.status).toBe(401);
  });

  it("refuses a member of the organization", async () => {
    const res = await asUser(tenant.analyst)("/api/billing/usage");

    expect(res.status).toBe(403);
    // The refusal must not leak the numbers it is refusing.
    expect(await res.text()).not.toContain("spent");
  });

  it("answers the owner", async () => {
    const res = await asUser(tenant.owner)("/api/billing/usage");
    expect(res.status).toBe(200);
  });
});

describe("GET /api/billing/usage — the breakdown", () => {
  it("attributes each seat's spending to that seat", async () => {
    const body = await readUsage(tenant.owner);

    expect(memberFor(body, tenant.owner.id)).toMatchObject({
      name: tenant.owner.name,
      role: "owner",
      isCurrentMember: true,
      spent: 3,
      runs: 1,
      simulations: 1,
    });
    expect(memberFor(body, tenant.analyst.id)).toMatchObject({
      name: tenant.analyst.name,
      role: "member",
      isCurrentMember: true,
      spent: 5,
      runs: 1,
      simulations: 2,
    });
  });

  // `max(created_at)` comes back as the raw column value, and that column holds
  // seconds. Read as milliseconds it would date every seat to 1970.
  it("reports last activity as a real timestamp", async () => {
    const body = await readUsage(tenant.owner);
    const lastActivity = memberFor(body, tenant.owner.id).lastActivityAt;

    expect(lastActivity).not.toBeNull();
    const age = Date.now() - new Date(lastActivity as string).getTime();
    expect(age).toBeGreaterThanOrEqual(0);
    expect(age).toBeLessThan(60_000);
  });

  it("reconciles with the org-wide wallet the owner is invoiced for", async () => {
    const body = await readUsage(tenant.owner);
    const wallet = await db.query.walletBalance.findFirst({
      where: eq(walletBalance.organizationId, tenant.org.id),
    });

    expect(body.totals.balance).toBe(wallet?.credits);
    // added − spent is the whole of the wallet, which is only true because the
    // user-less grant below is one of the rows.
    expect(body.totals.added - body.totals.spent).toBe(body.totals.balance);
    expect(body.totals).toMatchObject({ spent: 8, added: 100, runs: 2, simulations: 3, seats: 2 });
  });

  it("shows the user-less operator grant as its own row rather than dropping it", async () => {
    const body = await readUsage(tenant.owner);

    expect(memberFor(body, null)).toMatchObject({
      userId: null,
      name: null,
      isCurrentMember: false,
      added: 100,
      spent: 0,
    });
  });

  it("keeps rows belonging to an analyst who moved organization, marked as no longer a seat", async () => {
    // Their spend was paid for by this tenant, so it stays in this tenant's
    // numbers even though their membership is now elsewhere.
    const leaver = await seedUser({ name: "Moved analyst" });
    await spendCredit({
      organizationId: tenant.org.id,
      userId: leaver.id,
      idempotencyKey: `${tenant.org.id}:leaver-run`,
      cost: 2,
    });

    const body = await readUsage(tenant.owner);

    expect(memberFor(body, leaver.id)).toMatchObject({
      name: "Moved analyst",
      role: null,
      isCurrentMember: false,
      spent: 2,
    });
    expect(body.totals.spent).toBe(10);
    // The seat count is membership, not activity: they hold no seat here.
    expect(body.totals.seats).toBe(2);
  });

  it("lists a seat with no activity yet at zero rather than omitting it", async () => {
    const newHire = await seedUser({
      organizationId: tenant.org.id,
      role: "member",
      name: "New hire",
    });

    const body = await readUsage(tenant.owner);

    expect(memberFor(body, newHire.id)).toMatchObject({
      isCurrentMember: true,
      spent: 0,
      runs: 0,
      simulations: 0,
      lastActivityAt: null,
    });
  });

  it("stamps an actor on recent activity, and null on the rows that have no user", async () => {
    const body = await readUsage(tenant.owner);

    const grant = body.recent.find((r) => r.reason === "grant");
    expect(grant?.actor).toBeNull();

    const spends = body.recent.filter((r) => r.reason === "spend");
    expect(spends).toHaveLength(2);
    expect(spends.map((r) => r.actor?.userId).sort()).toEqual(
      [tenant.owner.id, tenant.analyst.id].sort()
    );
    expect(spends.every((r) => r.actor?.name !== null)).toBe(true);
  });

  it("caps recent activity at the requested limit", async () => {
    const body = await readUsage(tenant.owner, "?limit=2");

    expect(body.recent).toHaveLength(2);
  });
});

describe("GET /api/billing/usage — tenant isolation", () => {
  it("never counts another organization's rows", async () => {
    const other = await seedTenant("other");
    await spendCredit({
      organizationId: other.org.id,
      userId: other.analyst.id,
      idempotencyKey: "other:extra-run",
      cost: 7,
    });

    const body = await readUsage(tenant.owner);

    expect(body.totals.spent).toBe(8);
    expect(body.members.map((m) => m.userId)).not.toContain(other.analyst.id);
    expect(body.recent.map((r) => r.actor?.userId)).not.toContain(other.analyst.id);
  });

  it("gives each owner their own organization's numbers", async () => {
    const other = await seedTenant("other");

    const mine = await readUsage(tenant.owner);
    const theirs = await readUsage(other.owner);

    expect(mine.members.map((m) => m.userId)).toContain(tenant.analyst.id);
    expect(theirs.members.map((m) => m.userId)).toContain(other.analyst.id);
    expect(theirs.members.map((m) => m.userId)).not.toContain(tenant.analyst.id);
  });
});

describe("GET /api/billing/ledger stays personal (the other half of the decision)", () => {
  it("shows a member their own rows and nobody else's", async () => {
    const res = await asUser(tenant.analyst)("/api/billing/ledger");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { delta: number; reason: string }[] };

    // Their own spend, and neither the owner's run nor the user-less grant.
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ delta: -5, reason: "spend" });
  });
});
