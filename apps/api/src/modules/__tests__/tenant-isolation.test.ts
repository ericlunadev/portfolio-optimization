// Tenant isolation: for every organization-scoped endpoint, org A's session must
// not read, enumerate, update or delete org B's rows.
//
// Two conventions the assertions below encode, both from PLAN Task 0.6:
//
//   * A cross-tenant miss is **404, not 403**. 403 would confirm the row exists,
//     which leaks one tenant's data to another. The single exception is a
//     simulation shared with the caller's *own* organization: they can read it, so
//     a 404 on the write would be a lie. That case is 403.
//   * Wherever a request is refused, the target row is re-read straight from the
//     database and asserted unchanged. A handler that answered 404 *after*
//     mutating would otherwise pass.
//
// The `seedMovedAnalyst` fixture carries most of the weight. For every other
// fixture the owner predicate (`user_id = ?`) already excludes the other tenant's
// rows, so deleting `organization_id = ?` breaks nothing and the suite would
// certify a leak. The moved analyst owns rows stamped to the organization they
// left: the owner predicate matches and only the organization predicate keeps
// them out of reach.
//
// One known gap, found by the mutation pass and left deliberately: dropping the
// organization predicate from `writeScope` in `simulations/routes.ts` fails
// nothing here. It is an equivalent mutant, not a hole — the three write handlers
// gate on `isReadable` first, and `readScope` is organization-scoped, so any row
// that reaches the UPDATE already belongs to the caller's tenant. What the suite
// does catch is losing that gate: removing the `isReadable` 404 from a write
// handler fails, with or without `writeScope`'s organization predicate.

import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { env } from "../../config/env.js";
import { db } from "../../db/index.js";
import {
  backgroundTasks,
  creditLedger,
  simulations,
  userProfile,
  walletBalance,
} from "../../db/schema.js";
import { grantCredits } from "../../lib/billing/spend.js";
import {
  asAnonymous,
  asUser,
  seedMovedAnalyst,
  seedOrg,
  seedProfile,
  seedSimulation,
  seedTask,
  seedUser,
  type SeededOrg,
  type SeededUser,
} from "../../test/factories.js";

// Two tenants and one analyst in each, which is the shape most of these tests
// need. Every test seeds its own: the harness migrates a fresh database per test
// *file*, not per test, so rows accumulate within this file.
async function twoTenants(): Promise<{
  orgA: SeededOrg;
  orgB: SeededOrg;
  analystA: SeededUser;
  analystB: SeededUser;
}> {
  const orgA = await seedOrg({ name: "Tenant A" });
  const orgB = await seedOrg({ name: "Tenant B" });
  return {
    orgA,
    orgB,
    analystA: await seedUser({ organizationId: orgA.id }),
    analystB: await seedUser({ organizationId: orgB.id }),
  };
}

// A handful of these assertions drive a deliberate 500 (a missing membership row,
// or the unique index on `user_profile.user_id`). Both paths log first, and the
// stack traces bury the actual test output.
async function expectingLoggedError<T>(run: () => Promise<T>): Promise<T> {
  const silenced = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    return await run();
  } finally {
    silenced.mockRestore();
  }
}

async function readSimulation(id: string) {
  return db.query.simulations.findFirst({ where: eq(simulations.id, id) });
}

// ==================== simulations ====================

describe("simulations — cross-tenant", () => {
  it("does not enumerate another tenant's simulations", async () => {
    const { orgA, orgB, analystA, analystB } = await twoTenants();
    const mine = await seedSimulation({
      organizationId: orgA.id,
      userId: analystA.id,
      name: "Mine",
    });
    await seedSimulation({
      organizationId: orgB.id,
      userId: analystB.id,
      name: "Theirs",
    });

    const res = await asUser(analystA)("/api/simulations");

    expect(res.status).toBe(200);
    const items = (await res.json()) as { id: string }[];
    expect(items.map((i) => i.id)).toEqual([mine.id]);
  });

  it("answers 404, not 403, on GET of another tenant's simulation", async () => {
    const { orgB, analystA, analystB } = await twoTenants();
    const theirs = await seedSimulation({ organizationId: orgB.id, userId: analystB.id });

    const res = await asUser(analystA)(`/api/simulations/${theirs.id}`);

    // 403 would confirm the id exists. 404 makes it indistinguishable from a
    // simulation that was never created.
    expect(res.status).toBe(404);
  });

  it("answers 404 on PATCH of another tenant's simulation and leaves it untouched", async () => {
    const { orgB, analystA, analystB } = await twoTenants();
    const theirs = await seedSimulation({
      organizationId: orgB.id,
      userId: analystB.id,
      name: "Their name",
    });

    const res = await asUser(analystA)(`/api/simulations/${theirs.id}`, {
      method: "PATCH",
      json: { name: "Renamed by another tenant", pinned: true },
    });

    expect(res.status).toBe(404);
    const after = await readSimulation(theirs.id);
    expect(after?.name).toBe("Their name");
    expect(after?.pinned).toBe(false);
  });

  it("answers 404 on PUT of another tenant's simulation and leaves it untouched", async () => {
    const { orgB, analystA, analystB } = await twoTenants();
    const theirs = await seedSimulation({
      organizationId: orgB.id,
      userId: analystB.id,
      params: { tickers: ["ORIGINAL"] },
    });

    const res = await asUser(analystA)(`/api/simulations/${theirs.id}`, {
      method: "PUT",
      json: { params: { tickers: ["OVERWRITTEN"] }, result: { sharpe_ratio: 99 } },
    });

    expect(res.status).toBe(404);
    const after = await readSimulation(theirs.id);
    expect(JSON.parse(after!.params)).toEqual({ tickers: ["ORIGINAL"] });
  });

  it("answers 404 on DELETE of another tenant's simulation and the row survives", async () => {
    const { orgB, analystA, analystB } = await twoTenants();
    const theirs = await seedSimulation({ organizationId: orgB.id, userId: analystB.id });

    const res = await asUser(analystA)(`/api/simulations/${theirs.id}`, { method: "DELETE" });

    expect(res.status).toBe(404);
    expect(await readSimulation(theirs.id)).toBeDefined();
  });

  it("does not let sharing cross the organization boundary", async () => {
    const { orgB, analystA, analystB } = await twoTenants();
    const shared = await seedSimulation({
      organizationId: orgB.id,
      userId: analystB.id,
      sharedWithOrg: true,
    });

    const list = await asUser(analystA)("/api/simulations");
    const byId = await asUser(analystA)(`/api/simulations/${shared.id}`);

    // `sharedWithOrg` widens the read inside one tenant. It must never widen it
    // across tenants — that is what the organization predicate in `readScope` is
    // holding, and only this test holds it.
    expect((await list.json()) as unknown[]).toEqual([]);
    expect(byId.status).toBe(404);
  });

  it("requires a session", async () => {
    const res = await asAnonymous()("/api/simulations");
    expect(res.status).toBe(401);
  });
});

describe("simulations — the organization the caller left", () => {
  it("hides a simulation the caller owns but which is stamped to their previous organization", async () => {
    const moved = await seedMovedAnalyst();
    const request = asUser(moved.user);

    const list = await request("/api/simulations");
    const byId = await request(`/api/simulations/${moved.simulation.id}`);

    // `user_id` matches the caller here, so the owner predicate lets this row
    // through. Only `organization_id` keeps it out.
    expect((await list.json()) as unknown[]).toEqual([]);
    expect(byId.status).toBe(404);
  });

  it("refuses every write against a simulation stamped to the previous organization", async () => {
    const moved = await seedMovedAnalyst();
    const request = asUser(moved.user);
    const id = moved.simulation.id;

    const patched = await request(`/api/simulations/${id}`, {
      method: "PATCH",
      json: { name: "Taken along" },
    });
    const put = await request(`/api/simulations/${id}`, {
      method: "PUT",
      json: { params: { tickers: ["OVERWRITTEN"] }, result: {} },
    });
    const deleted = await request(`/api/simulations/${id}`, { method: "DELETE" });

    expect([patched.status, put.status, deleted.status]).toEqual([404, 404, 404]);
    const after = await readSimulation(id);
    expect(after?.name).toBe("Left behind");
    expect(JSON.parse(after!.params).tickers).not.toContain("OVERWRITTEN");
  });
});

describe("simulations — shared with the organization", () => {
  // The read/write split: sharing grants read, never write. A colleague can open
  // the row, so 404 on their write would be dishonest — hence 403.
  async function seedSharedRow() {
    const org = await seedOrg({ name: "One tenant, two analysts" });
    const owner = await seedUser({ organizationId: org.id });
    const colleague = await seedUser({ organizationId: org.id });
    const row = await seedSimulation({
      organizationId: org.id,
      userId: owner.id,
      name: "Shared with the desk",
      params: { tickers: ["ORIGINAL"] },
      sharedWithOrg: true,
    });
    return { org, owner, colleague, row };
  }

  it("is readable by a colleague, by id and in the list", async () => {
    const { colleague, row } = await seedSharedRow();
    const request = asUser(colleague);

    const byId = await request(`/api/simulations/${row.id}`);
    const list = await request("/api/simulations");

    expect(byId.status).toBe(200);
    const items = (await list.json()) as { id: string }[];
    expect(items.map((i) => i.id)).toContain(row.id);
  });

  it("returns 403 on PATCH and the row is provably unchanged", async () => {
    const { colleague, row } = await seedSharedRow();

    const res = await asUser(colleague)(`/api/simulations/${row.id}`, {
      method: "PATCH",
      json: { name: "Renamed by a colleague", pinned: true },
    });

    expect(res.status).toBe(403);
    const after = await readSimulation(row.id);
    expect(after?.name).toBe("Shared with the desk");
    expect(after?.pinned).toBe(false);
  });

  it("returns 403 on PUT and the row is provably unchanged", async () => {
    const { colleague, row } = await seedSharedRow();

    const res = await asUser(colleague)(`/api/simulations/${row.id}`, {
      method: "PUT",
      json: { params: { tickers: ["OVERWRITTEN"] }, result: { sharpe_ratio: 99 } },
    });

    expect(res.status).toBe(403);
    const after = await readSimulation(row.id);
    expect(JSON.parse(after!.params)).toEqual({ tickers: ["ORIGINAL"] });
  });

  it("returns 403 on DELETE and the row survives", async () => {
    const { colleague, row } = await seedSharedRow();

    const res = await asUser(colleague)(`/api/simulations/${row.id}`, { method: "DELETE" });

    expect(res.status).toBe(403);
    expect(await readSimulation(row.id)).toBeDefined();
  });

  it("still lets the owner write to it", async () => {
    const { owner, row } = await seedSharedRow();

    const res = await asUser(owner)(`/api/simulations/${row.id}`, {
      method: "PATCH",
      json: { pinned: true },
    });

    // Guards the other direction: a 403-everywhere implementation would satisfy
    // every assertion above and break the product.
    expect(res.status).toBe(200);
    expect((await readSimulation(row.id))?.pinned).toBe(true);
  });
});

// ==================== onboarding / user_profile ====================

describe("onboarding / user_profile", () => {
  // `user_profile.user_id` is UNIQUE, so a moved analyst has exactly one profile
  // and it belongs to the organization they left. Every assertion here is about
  // that row staying unreachable from their new tenant.
  async function seedCompletedForeignProfile() {
    const moved = await seedMovedAnalyst();
    await db
      .update(userProfile)
      .set({
        countryCode: "MX",
        currency: "MXN",
        experience: "advanced",
        horizon: "long",
        riskBehavior: "hold",
        riskTolerance: "moderate",
        goal: "growth",
        marketsOfInterest: JSON.stringify(["MX"]),
        otherMarkets: JSON.stringify([]),
        conceptFamiliarity: JSON.stringify(["markowitz"]),
        currentStep: 4,
      })
      .where(eq(userProfile.userId, moved.user.id));
    return moved;
  }

  it("never hands back a profile stamped to another organization", async () => {
    const moved = await seedMovedAnalyst();

    const res = await expectingLoggedError(() => asUser(moved.user)("/api/onboarding"));

    // `ensureRow` misses on the organization predicate and then tries to insert,
    // which the unique index on `user_id` rejects. Loud 500 by design — the same
    // stance the middleware takes on a missing membership. What must never
    // happen is a 200 carrying the other tenant's row.
    //
    // The body is Hono's plain `Internal Server Error`, not our JSON error
    // shape: `compose` catches a thrown handler error at its own dispatch level
    // and hands it to `onError`, so `middleware/error.ts` never sees it.
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).not.toContain(moved.previousOrganizationId);
    expect(body).not.toContain("MXN");
    const row = await db.query.userProfile.findFirst({
      where: eq(userProfile.userId, moved.user.id),
    });
    expect(row?.organizationId).toBe(moved.previousOrganizationId);
  });

  it("refuses to patch a profile stamped to another organization", async () => {
    const moved = await seedMovedAnalyst();

    const res = await asUser(moved.user)("/api/onboarding/step/1", {
      method: "PATCH",
      json: { countryCode: "US", currency: "USD" },
    });

    expect(res.status).toBe(404);
    const row = await db.query.userProfile.findFirst({
      where: eq(userProfile.userId, moved.user.id),
    });
    expect(row?.countryCode).toBe("MX");
    expect(row?.currency).toBe("MXN");
  });

  it("refuses to patch the investor profile stamped to another organization", async () => {
    const moved = await seedMovedAnalyst();

    const res = await asUser(moved.user)("/api/onboarding/step/2", {
      method: "PATCH",
      json: {
        experience: "advanced",
        horizon: "long",
        riskBehavior: "buy_more",
        goal: "growth",
      },
    });

    expect(res.status).toBe(404);
    const row = await db.query.userProfile.findFirst({
      where: eq(userProfile.userId, moved.user.id),
    });
    expect(row?.experience).toBeNull();
    expect(row?.riskTolerance).toBeNull();
  });

  it("refuses to complete onboarding against another organization's profile, and grants nothing", async () => {
    const moved = await seedCompletedForeignProfile();

    const res = await asUser(moved.user)("/api/onboarding/complete", { method: "POST" });

    expect(res.status).toBe(404);
    const row = await db.query.userProfile.findFirst({
      where: eq(userProfile.userId, moved.user.id),
    });
    expect(row?.completedAt).toBeNull();
    // The profile is complete enough to pass the field checks, so without the
    // organization predicate this request would 200 *and* move credits into a
    // tenant the caller no longer belongs to.
    const granted = await db.query.creditLedger.findMany({
      where: eq(creditLedger.userId, moved.user.id),
    });
    expect(granted).toEqual([]);
  });

  it("gives the caller a profile in their own organization, not another tenant's", async () => {
    const { orgA, orgB, analystA, analystB } = await twoTenants();
    await seedProfile({
      organizationId: orgB.id,
      userId: analystB.id,
      countryCode: "AR",
      currency: "ARS",
    });

    const res = await asUser(analystA)("/api/onboarding");

    expect(res.status).toBe(200);
    const body = (await res.json()) as { organizationId: string; countryCode: string | null };
    expect(body.organizationId).toBe(orgA.id);
    expect(body.countryCode).toBeNull();
  });

  it("requires a session", async () => {
    const res = await asAnonymous()("/api/onboarding");
    expect(res.status).toBe(401);
  });
});

// ==================== background tasks ====================

describe("tasks", () => {
  async function readTask(id: string) {
    return db.query.backgroundTasks.findFirst({ where: eq(backgroundTasks.id, id) });
  }

  it("requires a session on GET (bug B2)", async () => {
    const { orgB, analystB } = await twoTenants();
    const task = await seedTask({ organizationId: orgB.id, userId: analystB.id });

    const res = await asAnonymous()(`/api/tasks/${task.id}`);

    // This route shipped with no middleware at all and returned `result_data` to
    // anyone who knew a task id.
    expect(res.status).toBe(401);
  });

  it("requires a session on DELETE (bug B3)", async () => {
    const { orgB, analystB } = await twoTenants();
    const task = await seedTask({
      organizationId: orgB.id,
      userId: analystB.id,
      status: "running",
    });

    const res = await asAnonymous()(`/api/tasks/${task.id}`, { method: "DELETE" });

    expect(res.status).toBe(401);
    expect((await readTask(task.id))?.status).toBe("running");
  });

  it("answers 404 on GET of another tenant's task", async () => {
    const { orgB, analystA, analystB } = await twoTenants();
    const task = await seedTask({
      organizationId: orgB.id,
      userId: analystB.id,
      resultData: { secret: "another tenant's result" },
    });

    const res = await asUser(analystA)(`/api/tasks/${task.id}`);

    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("another tenant's result");
  });

  it("answers 404 on GET of a colleague's task in the same organization (bug B3)", async () => {
    const org = await seedOrg();
    const owner = await seedUser({ organizationId: org.id });
    const colleague = await seedUser({ organizationId: org.id });
    const task = await seedTask({ organizationId: org.id, userId: owner.id });

    const res = await asUser(colleague)(`/api/tasks/${task.id}`);

    // Tasks are not shared the way simulations can be: the owner predicate holds
    // inside a tenant as well as across tenants.
    expect(res.status).toBe(404);
  });

  it("does not cancel another tenant's task", async () => {
    const { orgB, analystA, analystB } = await twoTenants();
    const task = await seedTask({
      organizationId: orgB.id,
      userId: analystB.id,
      status: "running",
    });

    const res = await asUser(analystA)(`/api/tasks/${task.id}`, { method: "DELETE" });

    expect(res.status).toBe(404);
    const after = await readTask(task.id);
    expect(after?.status).toBe("running");
    expect(after?.completedAt).toBeNull();
  });

  it("does not cancel a colleague's task in the same organization (bug B3)", async () => {
    const org = await seedOrg();
    const owner = await seedUser({ organizationId: org.id });
    const colleague = await seedUser({ organizationId: org.id });
    const task = await seedTask({
      organizationId: org.id,
      userId: owner.id,
      status: "running",
    });

    const res = await asUser(colleague)(`/api/tasks/${task.id}`, { method: "DELETE" });

    expect(res.status).toBe(404);
    expect((await readTask(task.id))?.status).toBe("running");
  });

  it("hides a task the caller owns but which is stamped to their previous organization", async () => {
    const moved = await seedMovedAnalyst();
    const request = asUser(moved.user);

    const read = await request(`/api/tasks/${moved.task.id}`);
    const cancelled = await request(`/api/tasks/${moved.task.id}`, { method: "DELETE" });

    expect([read.status, cancelled.status]).toEqual([404, 404]);
    expect((await readTask(moved.task.id))?.status).toBe("completed");
  });
});

// ==================== billing ====================

describe("billing", () => {
  it("reports only the caller's organization's wallet balance", async () => {
    const { orgA, orgB, analystA } = await twoTenants();
    await grantCredits({
      organizationId: orgA.id,
      userId: analystA.id,
      credits: 7,
      reason: "grant",
      idempotencyKey: `seed:${orgA.id}`,
    });
    await grantCredits({
      organizationId: orgB.id,
      userId: null,
      credits: 500,
      reason: "grant",
      idempotencyKey: `seed:${orgB.id}`,
    });

    const res = await asUser(analystA)("/api/billing/wallet");

    expect(res.status).toBe(200);
    expect((await res.json()) as { credits: number }).toMatchObject({ credits: 7 });
  });

  it("lists only ledger rows belonging to the caller's current organization", async () => {
    const moved = await seedMovedAnalyst();
    await grantCredits({
      organizationId: moved.previousOrganizationId,
      userId: moved.user.id,
      credits: 42,
      reason: "grant",
      idempotencyKey: `previous:${moved.user.id}`,
    });
    await grantCredits({
      organizationId: moved.user.organizationId,
      userId: moved.user.id,
      credits: 5,
      reason: "grant",
      idempotencyKey: `current:${moved.user.id}`,
    });

    const res = await asUser(moved.user)("/api/billing/ledger");

    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { delta: number }[] };
    // Both rows carry this user's id; the organization predicate is the only
    // thing separating what they can see from what their old firm paid for.
    expect(body.items.map((i) => i.delta)).toEqual([5]);
  });

  it("spends from the caller's organization and never touches another tenant's wallet", async () => {
    const { orgA, orgB, analystA } = await twoTenants();
    const cost = env.ADVISOR_CALL_COST_CREDITS;
    await grantCredits({
      organizationId: orgA.id,
      userId: analystA.id,
      credits: cost,
      reason: "grant",
      idempotencyKey: `seed:${orgA.id}`,
    });
    await grantCredits({
      organizationId: orgB.id,
      userId: null,
      credits: cost,
      reason: "grant",
      idempotencyKey: `seed:${orgB.id}`,
    });

    const res = await asUser(analystA)("/api/billing/advisor-call", { method: "POST" });

    expect(res.status).toBe(200);
    const walletA = await db.query.walletBalance.findFirst({
      where: eq(walletBalance.organizationId, orgA.id),
    });
    const walletB = await db.query.walletBalance.findFirst({
      where: eq(walletBalance.organizationId, orgB.id),
    });
    expect(walletA?.credits).toBe(0);
    expect(walletB?.credits).toBe(cost);
  });

  it("does not let one tenant replay another tenant's idempotency key (bug B1)", async () => {
    const { orgA, orgB, analystA, analystB } = await twoTenants();
    const cost = env.ADVISOR_CALL_COST_CREDITS;
    for (const [org, analyst] of [
      [orgA, analystA],
      [orgB, analystB],
    ] as const) {
      await grantCredits({
        organizationId: org.id,
        userId: analyst.id,
        credits: cost,
        reason: "grant",
        idempotencyKey: `seed:${org.id}`,
      });
    }
    const key = "shared-idempotency-key";

    await asUser(analystB)("/api/billing/advisor-call", {
      method: "POST",
      headers: { "Idempotency-Key": key },
    });
    const replay = await asUser(analystA)("/api/billing/advisor-call", {
      method: "POST",
      headers: { "Idempotency-Key": key },
    });

    expect(replay.status).toBe(200);
    // The replay must be a real charge against org A, not a free ride on org B's
    // ledger row. Before B1 was fixed the lookup was keyed on the idempotency key
    // alone, so this returned org B's row and spent nothing.
    //
    // Counted per organization, not across the whole table: rows accumulate for
    // the lifetime of this file.
    const spendsIn = async (organizationId: string) =>
      db.query.creditLedger.findMany({
        where: and(
          eq(creditLedger.organizationId, organizationId),
          eq(creditLedger.reason, "spend")
        ),
      });
    expect(await spendsIn(orgA.id)).toHaveLength(1);
    expect(await spendsIn(orgB.id)).toHaveLength(1);
    const walletA = await db.query.walletBalance.findFirst({
      where: eq(walletBalance.organizationId, orgA.id),
    });
    expect(walletA?.credits).toBe(0);
  });

  it("requires a session on the wallet and the ledger", async () => {
    const anonymous = asAnonymous();
    expect((await anonymous("/api/billing/wallet")).status).toBe(401);
    expect((await anonymous("/api/billing/ledger")).status).toBe(401);
  });
});

// ==================== organization resolution ====================

describe("organization resolution", () => {
  it("fails loudly for a signed-in user with no membership row", async () => {
    const orphan = await seedUser({ withMembership: false });

    const res = await expectingLoggedError(() => asUser(orphan)("/api/simulations"));

    // Deliberate: the middleware must not invent an organization on a request
    // path, because whatever it invented would then own the caller's writes.
    expect(res.status).toBe(500);
  });

  it("keeps two analysts in the same organization on the same tenant", async () => {
    const org = await seedOrg();
    const first = await seedUser({ organizationId: org.id });
    const second = await seedUser({ organizationId: org.id });
    await seedSimulation({ organizationId: org.id, userId: first.id, name: "Not shared" });

    const res = await asUser(second)("/api/simulations");

    // Same tenant, but sharing was never switched on: the owner predicate still
    // applies inside an organization.
    expect((await res.json()) as unknown[]).toEqual([]);
    const rows = await db.query.simulations.findMany({
      where: and(eq(simulations.organizationId, org.id), eq(simulations.userId, first.id)),
    });
    expect(rows).toHaveLength(1);
  });
});
