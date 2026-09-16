// PLAN Task 1.7 — the owner-only branding settings endpoint.
//
// Two things are being pinned here, and they are the two that make branding
// self-serve without making it a liability:
//
//   * Only an `owner` reads or writes the tenant's brand. A member gets a 403,
//     which is the answer the settings page renders its notice from — not an
//     error it reports.
//   * The accent is validated before it is stored. It is the one colour input a
//     tenant gets (D9) and it feeds three palettes (§3.3), so a junk value there
//     would surface as a broken app, a broken chart and a broken PDF at once.
//
// The router is mounted into a local Hono app rather than driven through
// `app.fetch`: `apps/api/src/app.ts` belongs to another change in flight and
// does not mount this file yet. Everything under test is still the real thing —
// the real `authMiddleware`, the real membership lookup, the real database.

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/index.js";
import { organizationBranding } from "../../db/schema.js";
import branding, { normalizeAccentHex, parseBrandingUpdate } from "./branding.js";
import {
  installSessionStub,
  seedOrg,
  seedUser,
  type SeededOrg,
  type SeededUser,
} from "../../test/factories.js";

const app = new Hono();
app.route("/api/organizations", branding);

function request(path: string, init: RequestInit & { json?: unknown } = {}) {
  const { json, ...rest } = init;
  const headers = new Headers(rest.headers);
  let body = rest.body ?? null;
  if (json !== undefined) {
    body = JSON.stringify(json);
    headers.set("Content-Type", "application/json");
  }
  return new Request(new URL(path, "http://api.test"), { ...rest, headers, body });
}

/** The same Bearer-token convention `factories.asUser` uses. */
function as(seeded: SeededUser) {
  installSessionStub();
  return (path: string, init: RequestInit & { json?: unknown } = {}) => {
    const req = request(path, init);
    req.headers.set("Authorization", `Bearer ${seeded.sessionToken}`);
    return app.fetch(req);
  };
}

let org: SeededOrg;
let owner: SeededUser;
let member: SeededUser;

beforeEach(async () => {
  org = await seedOrg({ tier: "whitelabel" });
  owner = await seedUser({ organizationId: org.id, role: "owner" });
  member = await seedUser({ organizationId: org.id, role: "member" });
});

describe("GET /api/organizations/branding/settings", () => {
  it("refuses a member", async () => {
    const res = await as(member)("/api/organizations/branding/settings");

    expect(res.status).toBe(403);
  });

  it("refuses an anonymous caller", async () => {
    installSessionStub();
    const res = await app.fetch(request("/api/organizations/branding/settings"));

    expect(res.status).toBe(401);
  });

  it("answers an owner with the tier and the font menu, even with no branding row", async () => {
    const res = await as(owner)("/api/organizations/branding/settings");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.organizationId).toBe(org.id);
    expect(body.tier).toBe("whitelabel");
    expect(body.accentHex).toBeNull();
    expect(body.fontKeys).toContain("instrument-sans");
  });
});

describe("PUT /api/organizations/branding", () => {
  it("refuses a member and leaves the row untouched", async () => {
    const res = await as(member)("/api/organizations/branding", {
      method: "PUT",
      json: { productName: "Member's Rebrand" },
    });

    expect(res.status).toBe(403);
    const row = await db.query.organizationBranding.findFirst({
      where: eq(organizationBranding.organizationId, org.id),
    });
    expect(row).toBeUndefined();
  });

  it("creates the branding row on first save", async () => {
    const res = await as(owner)("/api/organizations/branding", {
      method: "PUT",
      json: {
        productName: "Meridian Portfolio",
        accentHex: "#2F6F4F",
        fontKey: "manrope",
        supportEmail: "help@meridian.example",
        privacyPolicyUrl: "https://meridian.example/privacy",
        termsUrl: "https://meridian.example/terms",
        disclaimerText: "Meridian does not give investment advice.",
      },
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    // Normalised on the way in, so every consumer of §3.3 gets one shape.
    expect(body.accentHex).toBe("#2f6f4f");
    expect(body.productName).toBe("Meridian Portfolio");

    const row = await db.query.organizationBranding.findFirst({
      where: eq(organizationBranding.organizationId, org.id),
    });
    expect(row?.accentHex).toBe("#2f6f4f");
    expect(row?.supportEmail).toBe("help@meridian.example");
  });

  it("updates an existing row without clearing the fields it does not name", async () => {
    await as(owner)("/api/organizations/branding", {
      method: "PUT",
      json: { productName: "Meridian Portfolio", accentHex: "#2f6f4f" },
    });

    const res = await as(owner)("/api/organizations/branding", {
      method: "PUT",
      json: { tagline: "Allocation, decided." },
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.tagline).toBe("Allocation, decided.");
    expect(body.productName).toBe("Meridian Portfolio");
    expect(body.accentHex).toBe("#2f6f4f");
  });

  it("clears a field sent as an empty string", async () => {
    await as(owner)("/api/organizations/branding", {
      method: "PUT",
      json: { tagline: "Allocation, decided." },
    });

    const res = await as(owner)("/api/organizations/branding", {
      method: "PUT",
      json: { tagline: "" },
    });

    expect((await res.json()).tagline).toBeNull();
  });

  it("rejects an accent that is not a hex colour", async () => {
    const res = await as(owner)("/api/organizations/branding", {
      method: "PUT",
      json: { accentHex: "rebeccapurple" },
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.fields.accentHex).toBeTruthy();

    const row = await db.query.organizationBranding.findFirst({
      where: eq(organizationBranding.organizationId, org.id),
    });
    expect(row).toBeUndefined();
  });

  it("rejects a font outside the fixed menu (D11)", async () => {
    const res = await as(owner)("/api/organizations/branding", {
      method: "PUT",
      json: { fontKey: "comic-sans" },
    });

    expect(res.status).toBe(400);
    expect((await res.json()).fields.fontKey).toBeTruthy();
  });

  it("rejects a malformed support email and a non-http policy URL", async () => {
    const res = await as(owner)("/api/organizations/branding", {
      method: "PUT",
      json: { supportEmail: "help at meridian", termsUrl: "javascript:alert(1)" },
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.fields.supportEmail).toBeTruthy();
    expect(body.fields.termsUrl).toBeTruthy();
  });

  it("ignores the tier, so an owner cannot drop the 'Powered by' line (D14)", async () => {
    const cobranded = await seedOrg({ tier: "cobranded" });
    const cobrandedOwner = await seedUser({
      organizationId: cobranded.id,
      role: "owner",
    });

    const res = await as(cobrandedOwner)("/api/organizations/branding", {
      method: "PUT",
      json: { tier: "whitelabel", productName: "Nice Try" },
    });

    expect((await res.json()).tier).toBe("cobranded");
  });

  it("writes nothing for another organization", async () => {
    const other = await seedOrg();
    await seedUser({ organizationId: other.id, role: "owner" });

    await as(owner)("/api/organizations/branding", {
      method: "PUT",
      json: { productName: "Meridian Portfolio" },
    });

    const row = await db.query.organizationBranding.findFirst({
      where: eq(organizationBranding.organizationId, other.id),
    });
    expect(row).toBeUndefined();
  });
});

describe("normalizeAccentHex", () => {
  it("expands shorthand and lowercases", () => {
    expect(normalizeAccentHex("#2F6")).toBe("#22ff66");
    expect(normalizeAccentHex("2F6F4F")).toBe("#2f6f4f");
  });

  it("returns null for anything that is not a hex colour", () => {
    expect(normalizeAccentHex("")).toBeNull();
    expect(normalizeAccentHex("#12345")).toBeNull();
    expect(normalizeAccentHex("rgb(1,2,3)")).toBeNull();
  });
});

describe("parseBrandingUpdate", () => {
  it("leaves out a field the body does not mention", () => {
    const parsed = parseBrandingUpdate({ tagline: "Hello" });

    expect(parsed).toEqual({ values: { tagline: "Hello" } });
  });

  it("reports every invalid field at once", () => {
    const parsed = parseBrandingUpdate({
      accentHex: "nope",
      fontKey: "comic-sans",
      productName: "x".repeat(200),
    });

    expect("errors" in parsed && Object.keys(parsed.errors).sort()).toEqual([
      "accentHex",
      "fontKey",
      "productName",
    ]);
  });
});
