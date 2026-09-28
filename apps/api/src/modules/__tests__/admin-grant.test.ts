// PLAN Task 2.3 — the admin credit grant.
//
// D8 says a tenant's end users never transact, so an invoiced customer has no
// way to top up their wallet from inside the app: an operator does it for them
// after the purchase order clears. That makes this the one route that can create
// credits out of nothing, which is why the tests below care as much about who is
// refused as about what a successful grant writes.
//
// The guard is a shared secret rather than an admin role because no
// platform-admin concept exists in this API (PLAN §9.5 escalates the real
// authority model). `INTERNAL_API_SECRET` is read per request, not at module
// scope, which is what lets these tests set and unset it.

import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/index.js";
import { creditLedger, walletBalance } from "../../db/schema.js";
import { asAnonymous, seedOrg, seedUser, type SeededOrg } from "../../test/factories.js";

const SECRET = "internal-secret-for-tests";

type GrantBody = {
  organizationId: string;
  credits: number;
  reference: string;
  note?: string;
};

function postGrant(body: Partial<GrantBody>, bearer: string | null = SECRET) {
  return asAnonymous()("/api/billing/internal/grant", {
    method: "POST",
    headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
    json: body,
  });
}

async function ledgerRows(organizationId: string) {
  return db.query.creditLedger.findMany({
    where: eq(creditLedger.organizationId, organizationId),
  });
}

async function walletCredits(organizationId: string): Promise<number | undefined> {
  const row = await db.query.walletBalance.findFirst({
    where: eq(walletBalance.organizationId, organizationId),
  });
  return row?.credits;
}

let tenant: SeededOrg;

beforeEach(async () => {
  process.env.INTERNAL_API_SECRET = SECRET;
  tenant = await seedOrg();
});

afterEach(() => {
  delete process.env.INTERNAL_API_SECRET;
});

describe("POST /api/billing/internal/grant — the guard", () => {
  it("refuses a request with no bearer token", async () => {
    const res = await postGrant({ organizationId: tenant.id, credits: 500, reference: "PO-1" }, null);

    expect(res.status).toBe(401);
    expect(await ledgerRows(tenant.id)).toHaveLength(0);
  });

  it("refuses a wrong secret", async () => {
    const res = await postGrant(
      { organizationId: tenant.id, credits: 500, reference: "PO-1" },
      "not-the-secret"
    );

    expect(res.status).toBe(401);
    expect(await ledgerRows(tenant.id)).toHaveLength(0);
  });

  // A secret of a different length must not answer differently from a wrong
  // secret of the same length: `timingSafeEqual` throws on a length mismatch, so
  // the handler has to compare lengths itself rather than let that escape as a 500.
  it("refuses a secret of the wrong length with the same 401", async () => {
    const res = await postGrant(
      { organizationId: tenant.id, credits: 500, reference: "PO-1" },
      SECRET.slice(0, 4)
    );

    expect(res.status).toBe(401);
  });

  it("refuses everything when INTERNAL_API_SECRET is not configured", async () => {
    delete process.env.INTERNAL_API_SECRET;

    const res = await postGrant({ organizationId: tenant.id, credits: 500, reference: "PO-1" }, null);

    // 503, not 401: an unset secret is our misconfiguration, and the route must
    // not become open just because nobody set the variable.
    expect(res.status).toBe(503);
    expect(await ledgerRows(tenant.id)).toHaveLength(0);
  });

  it("takes no session — an authenticated member cannot reach it either", async () => {
    const member = await seedUser({ organizationId: tenant.id, role: "member" });

    // `asUser` sends the session bearer, which is not the internal secret.
    const res = await asAnonymous()("/api/billing/internal/grant", {
      method: "POST",
      headers: { Authorization: `Bearer ${member.sessionToken}` },
      json: { organizationId: tenant.id, credits: 500, reference: "PO-1" },
    });

    expect(res.status).toBe(401);
    expect(await ledgerRows(tenant.id)).toHaveLength(0);
  });
});

describe("POST /api/billing/internal/grant — the write", () => {
  it("writes a grant row with no acting user and moves the wallet", async () => {
    const res = await postGrant({
      organizationId: tenant.id,
      credits: 500,
      reference: "PO-2214",
      note: "Net-30, invoice 2214",
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { credits: number; balanceAfter: number; ledgerId: string };
    expect(body.credits).toBe(500);
    expect(body.balanceAfter).toBe(500);

    const rows = await ledgerRows(tenant.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: body.ledgerId,
      organizationId: tenant.id,
      // No acting user: the grant is the platform's, not any analyst's.
      userId: null,
      delta: 500,
      reason: "grant",
      balanceAfter: 500,
      idempotencyKey: "grant:PO-2214",
    });
    expect(await walletCredits(tenant.id)).toBe(500);
  });

  it("is idempotent on the purchase order reference", async () => {
    const first = await postGrant({ organizationId: tenant.id, credits: 500, reference: "PO-9" });
    const second = await postGrant({ organizationId: tenant.id, credits: 500, reference: "PO-9" });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await ledgerRows(tenant.id)).toHaveLength(1);
    expect(await walletCredits(tenant.id)).toBe(500);
  });

  it("reports what the ledger actually holds when a reference is reused", async () => {
    await postGrant({ organizationId: tenant.id, credits: 500, reference: "PO-9b" });
    const corrected = await postGrant({ organizationId: tenant.id, credits: 800, reference: "PO-9b" });

    // The second call granted nothing. Echoing back "800" would tell an operator
    // their correction landed when the wallet never moved.
    expect(((await corrected.json()) as { credits: number }).credits).toBe(500);
    expect(await walletCredits(tenant.id)).toBe(500);
  });

  it("credits only the organization named in the body", async () => {
    const other = await seedOrg();

    await postGrant({ organizationId: tenant.id, credits: 500, reference: "PO-10" });

    expect(await walletCredits(tenant.id)).toBe(500);
    expect(await walletCredits(other.id)).toBeUndefined();
    expect(await ledgerRows(other.id)).toHaveLength(0);
  });

  it("answers 404 for an unknown organization instead of failing on the foreign key", async () => {
    const res = await postGrant({ organizationId: "org-does-not-exist", credits: 500, reference: "PO-11" });

    expect(res.status).toBe(404);
  });

  it("rejects a non-positive grant", async () => {
    const res = await postGrant({ organizationId: tenant.id, credits: 0, reference: "PO-12" });

    expect(res.status).toBe(400);
    expect(await ledgerRows(tenant.id)).toHaveLength(0);
  });

  it("requires a reference, because that reference is the idempotency key", async () => {
    const res = await postGrant({ organizationId: tenant.id, credits: 500 });

    expect(res.status).toBe(400);
    expect(await ledgerRows(tenant.id)).toHaveLength(0);
  });

  // The grant has no user, so it is in nobody's personal ledger. It still moved
  // the wallet every member reads, which is exactly why the owner's usage view
  // (Task 2.4) has to show it.
  it("is invisible in a member's own ledger while counting in the org wallet", async () => {
    const member = await seedUser({ organizationId: tenant.id, role: "member" });
    await postGrant({ organizationId: tenant.id, credits: 500, reference: "PO-13" });

    const ownRows = await db.query.creditLedger.findMany({
      where: and(eq(creditLedger.organizationId, tenant.id), eq(creditLedger.userId, member.id)),
    });

    expect(ownRows).toHaveLength(0);
    expect(await walletCredits(tenant.id)).toBe(500);
  });
});
