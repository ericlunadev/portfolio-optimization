// PLAN Task 1.1 — the public host → tenant lookup.
//
// Two things are under test and they pull in opposite directions. The endpoint
// has to answer *anyone*, because the web middleware and root layout resolve a
// tenant before a visitor has a session — and it must not hand that anyone the
// client list. So every "does not enumerate" case below is a case where a
// near-miss has to answer exactly like a total miss.
//
// The lookup router is driven directly rather than through `app.ts`: `app.ts`
// does not mount it yet (that line is a follow-up for whoever owns the file),
// and the composition test at the bottom pins down why it must be mounted
// outside `/api/organizations`.

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/index.js";
import { organization, organizationBranding, organizationDomain } from "../../db/schema.js";
import { seedOrg, type SeededOrg } from "../../test/factories.js";
import brandingByHost, { normalizeHostname } from "../organizations/branding-by-host.js";
import organizations from "../organizations/routes.js";

const ORIGIN = "http://api.test";

async function byHost(host?: string, init: RequestInit = {}): Promise<Response> {
  const url = new URL("/by-host", ORIGIN);
  if (host !== undefined) url.searchParams.set("host", host);
  return brandingByHost.fetch(new Request(url, init));
}

async function seedDomain(organizationId: string, hostname: string): Promise<void> {
  await db.insert(organizationDomain).values({
    id: `domain-${randomUUID()}`,
    organizationId,
    hostname,
  });
}

async function seedBranding(
  organizationId: string,
  values: Partial<typeof organizationBranding.$inferInsert> = {}
): Promise<void> {
  await db.insert(organizationBranding).values({ organizationId, ...values });
}

let defaultOrg: SeededOrg;
let acme: SeededOrg;
let borealis: SeededOrg;

beforeEach(async () => {
  // Exactly one `is_default` row has to exist for the fallback to be
  // deterministic, and one test deliberately removes it. Cascades take the
  // branding, settings and domain rows with the organizations.
  await db.delete(organization);

  defaultOrg = await seedOrg({ slug: `d2c-${randomUUID()}`, isDefault: true });
  await seedBranding(defaultOrg.id, { productName: "Optimización de Portafolio" });

  acme = await seedOrg({ slug: `acme-${randomUUID()}`, tier: "whitelabel" });
  await seedDomain(acme.id, "acme.optim.app");
  await seedBranding(acme.id, {
    productName: "Acme Wealth",
    productShortName: "Acme",
    accentHex: "#2f6fed",
    supportEmail: "soporte@acme.test",
    disclaimerText: "Acme no ofrece asesoría de inversión.",
  });

  borealis = await seedOrg({ slug: `borealis-${randomUUID()}` });
  await seedDomain(borealis.id, "borealis.optim.app");
  await seedBranding(borealis.id, { productName: "Borealis", accentHex: "#8b5cf6" });
});

describe("GET /api/tenants/by-host", () => {
  it("resolves two hostnames to two different organizations", async () => {
    const [first, second] = await Promise.all([
      byHost("acme.optim.app"),
      byHost("borealis.optim.app"),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const acmeBody = await first.json();
    const borealisBody = await second.json();

    expect(acmeBody.organizationId).toBe(acme.id);
    expect(acmeBody.slug).toBe(acme.slug);
    expect(acmeBody.tier).toBe("whitelabel");
    expect(acmeBody.branding.productName).toBe("Acme Wealth");
    expect(acmeBody.branding.accentHex).toBe("#2f6fed");

    expect(borealisBody.organizationId).toBe(borealis.id);
    expect(borealisBody.branding.productName).toBe("Borealis");

    expect(acmeBody.organizationId).not.toBe(borealisBody.organizationId);
  });

  it("needs no session — this is the point of the endpoint", async () => {
    const res = await byHost("acme.optim.app");

    expect(res.status).toBe(200);
    expect((await res.json()).organizationId).toBe(acme.id);
  });

  it("serves the default tenant for an unknown host rather than a 404", async () => {
    const res = await byHost("nobody.optim.app");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.organizationId).toBe(defaultOrg.id);
    expect(body.isDefault).toBe(true);
  });

  it("normalizes the port, the case and the trailing root dot", async () => {
    for (const variant of ["ACME.optim.app", "acme.optim.app:3000", "acme.optim.app.", " acme.optim.app "]) {
      const body = await (await byHost(variant)).json();
      expect(body.organizationId, variant).toBe(acme.id);
    }
  });

  it("marks the answer uncacheable, so no shared cache can serve one tenant another's brand", async () => {
    const res = await byHost("acme.optim.app");

    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("404s only when no tenant exists at all", async () => {
    await db.delete(organizationDomain);
    await db.update(organization).set({ isDefault: false }).where(eq(organization.id, defaultOrg.id));

    const res = await byHost("acme.optim.app");

    expect(res.status).toBe(404);
  });
});

describe("it does not enumerate the client list", () => {
  // Each of these is a host somebody would try when fishing for tenants. All of
  // them must answer identically to a host that does not exist: 200, default
  // tenant, no hint that `acme.optim.app` is real.
  const nearMisses = [
    "acme", // the label on its own
    "acme.optim", // a prefix
    "optim.app", // the parent domain
    "acme.optim.app.attacker.test", // our host as a prefix of theirs
    "www.acme.optim.app", // a subdomain of a real tenant
    "%.optim.app", // a LIKE wildcard, in case the query ever stops being `eq`
    "acme_optim.app", // the single-character LIKE wildcard
    "%", // the whole table, were this a pattern match
    "*", // a glob
    "acme.optim.app'--", // quote-breaking
  ];

  it.each(nearMisses)("answers %j with the default tenant, not a match", async (host) => {
    const res = await byHost(host);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.organizationId).toBe(defaultOrg.id);
    expect(body.slug).not.toBe(acme.slug);
  });

  it("never returns more than one organization, whatever it is asked", async () => {
    const body = await (await byHost("acme.optim.app")).json();

    expect(Array.isArray(body)).toBe(false);
    expect(body.organizations).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain(borealis.id);
  });

  it("has no route that answers without a host", async () => {
    const missing = await byHost();
    const listing = await brandingByHost.fetch(new Request(new URL("/", ORIGIN)));

    expect(missing.status).toBe(400);
    expect(listing.status).toBe(404);
  });

  it("withholds the branding fields the authenticated route exists to serve", async () => {
    const body = await (await byHost("acme.optim.app")).json();

    expect(body.branding.supportEmail).toBeUndefined();
    expect(body.branding.privacyPolicyUrl).toBeUndefined();
    expect(body.branding.termsUrl).toBeUndefined();
    expect(body.branding.disclaimerText).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("soporte@acme.test");
  });
});

describe("composition", () => {
  // Hono re-registers a sub-app's middleware onto the parent at the mounted
  // prefix, so `routes.ts`'s `app.use("*", authMiddleware)` covers every path
  // under `/api/organizations/*` — including one declared by a different
  // sub-app mounted at the same prefix. This mirrors `app.ts` to prove the
  // lookup stays public at `/api/tenants` and would not at the other prefix.
  function compose(): Hono {
    const composed = new Hono();
    composed.route("/api/organizations", organizations);
    composed.route("/api/tenants", brandingByHost);
    return composed;
  }

  it("stays unauthenticated when mounted at /api/tenants alongside the authenticated org routes", async () => {
    const composed = compose();

    const lookup = await composed.fetch(
      new Request(`${ORIGIN}/api/tenants/by-host?host=acme.optim.app`)
    );
    const scoped = await composed.fetch(new Request(`${ORIGIN}/api/organizations/branding`));

    expect(lookup.status).toBe(200);
    expect((await lookup.json()).organizationId).toBe(acme.id);
    // The neighbouring sub-app is untouched: still 401 without a session.
    expect(scoped.status).toBe(401);
  });

  it("would be swallowed by the org routes' auth middleware at /api/organizations", async () => {
    const wrong = new Hono();
    wrong.route("/api/organizations", organizations);
    wrong.route("/api/organizations", brandingByHost);

    const res = await wrong.fetch(
      new Request(`${ORIGIN}/api/organizations/by-host?host=acme.optim.app`)
    );

    expect(res.status).toBe(401);
  });
});

describe("normalizeHostname", () => {
  it("keeps an IPv6 literal intact while dropping its port", () => {
    expect(normalizeHostname("[::1]:3000")).toBe("[::1]");
    expect(normalizeHostname("[::1]")).toBe("[::1]");
  });

  it("drops the port from a named host", () => {
    expect(normalizeHostname("localhost:3000")).toBe("localhost");
  });
});
