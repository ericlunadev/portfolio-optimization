// Smoke test for the harness itself, not the isolation suite — that lives in
// `src/modules/__tests__/tenant-isolation.test.ts`. What is proved here is that
// the pieces line up: setup.ts migrated a real database, factories.ts seeded it,
// and `app.fetch` reaches a route through the real authMiddleware.

import { describe, expect, it } from "vitest";
import { asAnonymous, asUser, seedMovedAnalyst, seedOrg, seedSimulation, seedUser } from "./factories.js";

describe("test harness", () => {
  it("serves an authenticated request through the composed app", async () => {
    const orgA = await seedOrg({ name: "Tenant A" });
    const orgB = await seedOrg({ name: "Tenant B" });
    const analystA = await seedUser({ organizationId: orgA.id });
    const analystB = await seedUser({ organizationId: orgB.id });

    const mine = await seedSimulation({
      organizationId: orgA.id,
      userId: analystA.id,
      name: "Tenant A portfolio",
    });
    await seedSimulation({
      organizationId: orgB.id,
      userId: analystB.id,
      name: "Tenant B portfolio",
    });

    const res = await asUser(analystA)("/api/simulations");

    expect(res.status).toBe(200);
    const items = (await res.json()) as { id: string }[];
    expect(items.map((item) => item.id)).toEqual([mine.id]);
  });

  it("leaves an unauthenticated request on the real 401 path", async () => {
    const res = await asAnonymous()("/api/simulations");

    expect(res.status).toBe(401);
  });

  it("seeds a moved analyst whose rows are owned by them but stamped elsewhere", async () => {
    const moved = await seedMovedAnalyst();

    // The shape the org predicate is the only thing standing between: same
    // owner, different organization.
    expect(moved.simulation.userId).toBe(moved.user.id);
    expect(moved.simulation.organizationId).toBe(moved.previousOrganizationId);
    expect(moved.user.organizationId).not.toBe(moved.previousOrganizationId);
  });
});
