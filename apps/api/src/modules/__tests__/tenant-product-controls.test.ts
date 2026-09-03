// PLAN Tasks 3.2 and 3.3: the Academia toggle and the three advisor CTA modes.
//
// Both are `organization_settings` columns that existed after Phase 0 and that
// nothing read. What is under test here is the wiring — that the column, and not
// an env var or a hardcoded constant, decides what the caller gets — plus the
// property that makes those switches worth having at all: one organization's
// settings never reach another's session.
//
// `seedOrg` covers `advisor_mode` but not the booking URL, the cost or the
// Academia flag, so those are written straight to the settings row after
// seeding. Folding them into the factory is the tidier end state (see the
// follow-ups) but would mean editing a fixture other tasks are also using.

import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { env } from "../../config/env.js";
import { db } from "../../db/index.js";
import { creditLedger, organizationSettings, walletBalance } from "../../db/schema.js";
import { grantCredits } from "../../lib/billing/spend.js";
import { asAnonymous, asUser, seedOrg, seedUser, type SeededUser } from "../../test/factories.js";

type SettingsPatch = {
  academiaEnabled?: boolean;
  advisorMode?: "off" | "platform" | "tenant";
  advisorBookingUrl?: string | null;
  advisorCostCredits?: number | null;
};

type SettingsResponse = {
  academiaEnabled: boolean;
  advisor: {
    mode: string;
    bookable: boolean;
    costCredits: number;
    providerName: string | null;
  };
};

/** An organization with the settings row a test needs, and one analyst inside it. */
async function seedTenant(
  patch: SettingsPatch & { name?: string } = {}
): Promise<{ organizationId: string; analyst: SeededUser }> {
  const { name, ...settings } = patch;
  const org = await seedOrg({
    name,
    advisorMode: settings.advisorMode ?? "off",
  });

  await db
    .update(organizationSettings)
    .set(settings)
    .where(eq(organizationSettings.organizationId, org.id));

  const analyst = await seedUser({ organizationId: org.id });
  return { organizationId: org.id, analyst };
}

async function fundWallet(organizationId: string, credits: number): Promise<void> {
  await grantCredits({
    organizationId,
    userId: null,
    credits,
    reason: "grant",
    idempotencyKey: `seed:${organizationId}:${credits}`,
  });
}

async function readSettings(analyst: SeededUser): Promise<SettingsResponse> {
  const res = await asUser(analyst)("/api/organizations/settings");
  expect(res.status).toBe(200);
  return (await res.json()) as SettingsResponse;
}

async function walletCredits(organizationId: string): Promise<number | undefined> {
  const row = await db.query.walletBalance.findFirst({
    where: eq(walletBalance.organizationId, organizationId),
  });
  return row?.credits;
}

async function spendRows(organizationId: string) {
  return db.query.creditLedger.findMany({
    where: and(
      eq(creditLedger.organizationId, organizationId),
      eq(creditLedger.reason, "spend")
    ),
  });
}

describe("GET /api/organizations/settings", () => {
  it("requires a session", async () => {
    const res = await asAnonymous()("/api/organizations/settings");
    expect(res.status).toBe(401);
  });

  it("never returns the booking URL, which is what the advisor call charges for", async () => {
    const { analyst } = await seedTenant({
      advisorMode: "tenant",
      advisorBookingUrl: "https://cal.com/acme/advisor",
    });

    const res = await asUser(analyst)("/api/organizations/settings");
    const body = await res.text();

    expect(body).not.toContain("cal.com");
    expect(JSON.parse(body).advisor.bookingUrl).toBeUndefined();
  });
});

describe("Academia toggle (PLAN Task 3.2)", () => {
  it("reports the flag as enabled when the organization has it on", async () => {
    const { analyst } = await seedTenant({ academiaEnabled: true });
    expect((await readSettings(analyst)).academiaEnabled).toBe(true);
  });

  it("reports the flag as disabled when the organization has it off", async () => {
    const { analyst } = await seedTenant({ academiaEnabled: false });
    expect((await readSettings(analyst)).academiaEnabled).toBe(false);
  });
});

describe("Advisor CTA modes (PLAN Task 3.3)", () => {
  it("'platform' books our advisor at the organization's price", async () => {
    const { organizationId, analyst } = await seedTenant({
      advisorMode: "platform",
      advisorCostCredits: 40,
    });
    await fundWallet(organizationId, 100);

    const settings = await readSettings(analyst);
    expect(settings.advisor).toMatchObject({
      mode: "platform",
      bookable: true,
      costCredits: 40,
      // The platform advisor is ours, so nothing tenant-specific names them.
      providerName: null,
    });

    const res = await asUser(analyst)("/api/billing/advisor-call", { method: "POST" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      bookingUrl: env.ADVISOR_BOOKING_URL,
      costCredits: 40,
    });
    expect(await walletCredits(organizationId)).toBe(60);
  });

  it("'tenant' books the tenant's own URL at the tenant's own price", async () => {
    const { organizationId, analyst } = await seedTenant({
      name: "Acme Capital",
      advisorMode: "tenant",
      advisorBookingUrl: "https://cal.com/acme-capital/asesor",
      advisorCostCredits: 250,
    });
    await fundWallet(organizationId, 300);

    const settings = await readSettings(analyst);
    expect(settings.advisor).toMatchObject({
      mode: "tenant",
      bookable: true,
      costCredits: 250,
      // Identity as data: the copy reads "an advisor from Acme Capital" without
      // any translated string owning the possessive.
      providerName: "Acme Capital",
    });

    const res = await asUser(analyst)("/api/billing/advisor-call", { method: "POST" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      bookingUrl: "https://cal.com/acme-capital/asesor",
      costCredits: 250,
    });
    expect(await walletCredits(organizationId)).toBe(50);
  });

  it("'off' is not bookable and charges nothing", async () => {
    const { organizationId, analyst } = await seedTenant({ advisorMode: "off" });
    await fundWallet(organizationId, 500);

    const settings = await readSettings(analyst);
    expect(settings.advisor).toMatchObject({ mode: "off", bookable: false });

    const res = await asUser(analyst)("/api/billing/advisor-call", { method: "POST" });

    expect(res.status).toBe(404);
    expect(await walletCredits(organizationId)).toBe(500);
    expect(await spendRows(organizationId)).toHaveLength(0);
  });

  it("'tenant' with no booking URL configured is not bookable, and still charges nothing", async () => {
    const { organizationId, analyst } = await seedTenant({
      advisorMode: "tenant",
      advisorBookingUrl: null,
    });
    await fundWallet(organizationId, 500);

    expect((await readSettings(analyst)).advisor).toMatchObject({
      mode: "tenant",
      bookable: false,
    });

    const res = await asUser(analyst)("/api/billing/advisor-call", { method: "POST" });

    expect(res.status).toBe(404);
    expect(await walletCredits(organizationId)).toBe(500);
    expect(await spendRows(organizationId)).toHaveLength(0);
  });

  it("falls back to the env default when the nullable cost column is NULL", async () => {
    const { analyst } = await seedTenant({
      advisorMode: "platform",
      advisorCostCredits: null,
    });

    expect((await readSettings(analyst)).advisor.costCredits).toBe(
      env.ADVISOR_CALL_COST_CREDITS
    );
  });
});

describe("one organization's product controls do not leak into another's", () => {
  it("each session reads only its own organization's switches", async () => {
    const strict = await seedTenant({
      name: "Strict Whitelabel",
      academiaEnabled: false,
      advisorMode: "off",
    });
    const permissive = await seedTenant({
      name: "Permissive Tenant",
      academiaEnabled: true,
      advisorMode: "tenant",
      advisorBookingUrl: "https://cal.com/permissive/advisor",
      advisorCostCredits: 10,
    });

    expect(await readSettings(strict.analyst)).toEqual({
      academiaEnabled: false,
      advisor: { mode: "off", bookable: false, costCredits: 100, providerName: null },
    });
    expect(await readSettings(permissive.analyst)).toEqual({
      academiaEnabled: true,
      advisor: {
        mode: "tenant",
        bookable: true,
        costCredits: 10,
        providerName: "Permissive Tenant",
      },
    });
  });

  it("a tenant with the CTA off cannot book through a neighbour that has it on", async () => {
    const strict = await seedTenant({ advisorMode: "off" });
    const permissive = await seedTenant({
      advisorMode: "tenant",
      advisorBookingUrl: "https://cal.com/neighbour/advisor",
      advisorCostCredits: 10,
    });
    await fundWallet(strict.organizationId, 500);
    await fundWallet(permissive.organizationId, 500);

    const refused = await asUser(strict.analyst)("/api/billing/advisor-call", {
      method: "POST",
    });
    const allowed = await asUser(permissive.analyst)("/api/billing/advisor-call", {
      method: "POST",
    });

    expect(refused.status).toBe(404);
    expect(allowed.status).toBe(200);
    // The neighbour's booking went through and was billed to the neighbour: the
    // refusal is a property of the caller's organization, not of the endpoint.
    expect(await walletCredits(strict.organizationId)).toBe(500);
    expect(await walletCredits(permissive.organizationId)).toBe(490);
  });
});
