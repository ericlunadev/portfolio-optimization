// Task 3.4. Phase 0 built the read/write split but left it unreachable: nothing
// could set `shared_with_org`, and the list payload named neither the flag nor
// the owner. A client reading that payload has no way to tell a row it may edit
// from a colleague's, so it renders rename and delete on both and collects a
// 403. The write path and the two payload fields therefore land together.

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "../../db/index.js";
import { simulations } from "../../db/schema.js";
import { asUser, seedOrg, seedSimulation, seedUser } from "../../test/factories.js";

type ListItem = { id: string; name: string | null; sharedWithOrg: boolean; isOwner: boolean };

async function seedDesk() {
  const org = await seedOrg({ name: "One tenant, two analysts" });
  const owner = await seedUser({ organizationId: org.id });
  const colleague = await seedUser({ organizationId: org.id });
  const row = await seedSimulation({
    organizationId: org.id,
    userId: owner.id,
    name: "Desk model",
  });
  return { org, owner, colleague, row };
}

function readSimulation(id: string) {
  return db.query.simulations.findFirst({ where: eq(simulations.id, id) });
}

describe("PATCH /api/simulations/:id — sharing", () => {
  it("lets the owner share a row", async () => {
    const { owner, row } = await seedDesk();

    const res = await asUser(owner)(`/api/simulations/${row.id}`, {
      method: "PATCH",
      json: { sharedWithOrg: true },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: row.id, sharedWithOrg: true });
    expect((await readSimulation(row.id))?.sharedWithOrg).toBe(true);
  });

  it("lets the owner stop sharing", async () => {
    const { owner, row } = await seedDesk();
    const request = asUser(owner);

    await request(`/api/simulations/${row.id}`, { method: "PATCH", json: { sharedWithOrg: true } });
    const res = await request(`/api/simulations/${row.id}`, {
      method: "PATCH",
      json: { sharedWithOrg: false },
    });

    expect(res.status).toBe(200);
    expect((await readSimulation(row.id))?.sharedWithOrg).toBe(false);
  });

  it("refuses to let a colleague unshare a row they do not own", async () => {
    const { owner, colleague, row } = await seedDesk();

    await asUser(owner)(`/api/simulations/${row.id}`, {
      method: "PATCH",
      json: { sharedWithOrg: true },
    });
    const res = await asUser(colleague)(`/api/simulations/${row.id}`, {
      method: "PATCH",
      json: { sharedWithOrg: false },
    });

    // Sharing is a write like any other: readable is not the same as writable.
    expect(res.status).toBe(403);
    expect((await readSimulation(row.id))?.sharedWithOrg).toBe(true);
  });

  it("refuses to let a colleague share a row that was never shared", async () => {
    const { colleague, row } = await seedDesk();

    const res = await asUser(colleague)(`/api/simulations/${row.id}`, {
      method: "PATCH",
      json: { sharedWithOrg: true },
    });

    // Unshared, so the colleague cannot even read it — 404, not 403.
    expect(res.status).toBe(404);
    expect((await readSimulation(row.id))?.sharedWithOrg).toBe(false);
  });
});

describe("GET /api/simulations — the payload says which rows are writable", () => {
  it("marks the caller's own rows as theirs", async () => {
    const { owner, row } = await seedDesk();

    const items = (await (await asUser(owner)("/api/simulations")).json()) as ListItem[];

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: row.id, isOwner: true, sharedWithOrg: false });
  });

  it("hides an unshared row from a colleague entirely", async () => {
    const { colleague } = await seedDesk();

    const items = (await (await asUser(colleague)("/api/simulations")).json()) as ListItem[];

    expect(items).toEqual([]);
  });

  it("shows a shared row to a colleague, flagged as not theirs", async () => {
    const { owner, colleague, row } = await seedDesk();
    await asUser(owner)(`/api/simulations/${row.id}`, {
      method: "PATCH",
      json: { sharedWithOrg: true },
    });

    const items = (await (await asUser(colleague)("/api/simulations")).json()) as ListItem[];

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: row.id, isOwner: false, sharedWithOrg: true });
  });

  it("agrees with what the write endpoint actually does", async () => {
    // The point of the flag: a client that trusts it never renders a control
    // that 403s. Assert the two answers cannot drift apart.
    const { org, owner, colleague } = await seedDesk();
    await seedSimulation({
      organizationId: org.id,
      userId: colleague.id,
      name: "The colleague's own",
    });
    const shared = await seedSimulation({
      organizationId: org.id,
      userId: owner.id,
      name: "Shared with the desk",
      sharedWithOrg: true,
    });

    const request = asUser(colleague);
    const items = (await (await request("/api/simulations")).json()) as ListItem[];
    expect(items).toHaveLength(2);
    expect(items.some((i) => i.id === shared.id && !i.isOwner)).toBe(true);

    for (const item of items) {
      const res = await request(`/api/simulations/${item.id}`, {
        method: "PATCH",
        json: { pinned: true },
      });
      expect(res.status).toBe(item.isOwner ? 200 : 403);
    }
  });
});
