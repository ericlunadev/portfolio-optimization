// PLAN §3.2 / Task 1.0: a tenant hostname registered in `organization_domain`
// must pass BetterAuth's origin check and the CORS allowlist, and nothing that
// merely resembles one may.
//
// Everything goes through the composed app with the headers a browser sends —
// the genuine sign-up, sign-in and sign-out endpoints and their real cookies,
// not the `asUser` session stub, which never reaches the origin check.
//
// The scheme and port rule differs in production, and `isProduction` is fixed
// when config/env.ts loads, so that half lives in tenant-origins-production.test.ts.
//
// `sendOnSignUp` is on and `lib/email/client.ts` throws without RESEND_API_KEY,
// so both are neutralised before the app is imported, as in
// signup-provisioning.test.ts.

import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

process.env.RESEND_API_KEY ??= "test-key-not-used";

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("resend.com")) {
    return new Response(JSON.stringify({ id: "stubbed" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return realFetch(input, init);
}) as typeof fetch;

const { default: app } = await import("../app.js");
const { env } = await import("../config/env.js");
const { db } = await import("../db/index.js");
const { organizationDomain } = await import("../db/schema.js");
const { TENANT_HOSTNAMES_TTL_MS, invalidateTenantOrigins } = await import("../lib/trusted-origins.js");
const { seedOrg } = await import("./factories.js");

const API = "http://api.test";
const PASSWORD = "correct-horse-battery";
const ANALYST = "analyst@acme.test";

const ACME = "http://acme.localhost:3000";
const BOREALIS = "http://borealis.localhost:3000";

// Each of these is refused by both gates. The first is simply unknown; the rest
// are built from a registered name, which is what a suffix, substring or
// wildcard match would wrongly accept.
const NOT_TENANTS: [string, string][] = [
  ["an unregistered host", "http://evil.test:3000"],
  ["a registered name followed by another domain", "http://acme.localhost.evil.test:3000"],
  ["a registered name at the end of another label", "http://evil-acme.localhost:3000"],
  ["a subdomain of a registered name", "http://app.acme.localhost:3000"],
  ["a registered name with a trailing dot", "http://acme.localhost.:3000"],
  ["a registered name on a non-web scheme", "ftp://acme.localhost:3000"],
  ["an opaque origin", "null"],
];

type AuthHeaders = { origin?: string; referer?: string; expoOrigin?: string; cookie?: string };

async function post(path: string, headers: AuthHeaders, json: unknown = {}): Promise<Response> {
  const request = new Headers({ "Content-Type": "application/json" });
  if (headers.origin) request.set("Origin", headers.origin);
  if (headers.referer) request.set("Referer", headers.referer);
  if (headers.expoOrigin) request.set("expo-origin", headers.expoOrigin);
  if (headers.cookie) request.set("Cookie", headers.cookie);
  return app.fetch(
    new Request(new URL(path, API), { method: "POST", headers: request, body: JSON.stringify(json) })
  );
}

function signIn(headers: AuthHeaders, extra: Record<string, string> = {}): Promise<Response> {
  return post("/api/auth/sign-in/email", headers, { email: ANALYST, password: PASSWORD, ...extra });
}

function signUp(headers: AuthHeaders): Promise<Response> {
  const email = `signup-${randomUUID()}@example.com`;
  return post("/api/auth/sign-up/email", headers, { email, password: PASSWORD, name: email });
}

function signOut(headers: AuthHeaders): Promise<Response> {
  return post("/api/auth/sign-out", headers);
}

function cookiesFrom(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((entry) => entry.split(";")[0])
    .join("; ");
}

/**
 * A live session, obtained without an Origin so it does not depend on the code
 * under test. BetterAuth only checks the origin of a sign-out that carries a
 * cookie, so a sign-out test without one would pass whatever the rule says.
 */
async function sessionCookie(): Promise<string> {
  const cookie = cookiesFrom(await signIn({}));
  expect(cookie).toContain("better-auth.session_token=");
  return cookie;
}

async function preflight(origin: string): Promise<Response> {
  return app.fetch(
    new Request(new URL("/api/billing/advisor-call", API), {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    })
  );
}

async function registerHostname(hostname: string): Promise<void> {
  const org = await seedOrg();
  await db.insert(organizationDomain).values({
    id: `domain-${randomUUID()}`,
    organizationId: org.id,
    hostname,
  });
}

beforeAll(async () => {
  await registerHostname("acme.localhost");
  await registerHostname("borealis.localhost");
  invalidateTenantOrigins();

  // No Origin and no cookie: BetterAuth has nothing to check, so this creates the
  // account without depending on the code under test.
  const response = await post("/api/auth/sign-up/email", {}, {
    email: ANALYST,
    password: PASSWORD,
    name: "Lucía Fernández",
  });
  expect(response.status).toBe(200);
});

describe("auth from a registered tenant hostname", () => {
  it("signs in", async () => {
    const response = await signIn({ origin: ACME });

    expect(response.status).toBe(200);
    expect(cookiesFrom(response)).toContain("better-auth.session_token=");
  });

  it("signs in on a second tenant, not only the first row", async () => {
    expect((await signIn({ origin: BOREALIS })).status).toBe(200);
  });

  it("signs up", async () => {
    expect((await signUp({ origin: ACME })).status).toBe(200);
  });

  it("signs out with the session cookie", async () => {
    const cookie = await sessionCookie();

    expect((await signOut({ origin: ACME, cookie })).status).toBe(200);
  });

  it("falls back to the Referer when the browser sent no Origin, as BetterAuth does", async () => {
    expect((await signIn({ referer: `${ACME}/auth/login?next=%2F` })).status).toBe(200);
  });

  it("accepts a callbackURL on the tenant the request came from", async () => {
    expect((await signIn({ origin: ACME }, { callbackURL: `${ACME}/dashboard` })).status).toBe(200);
  });

  // The request's own origin is what gets trusted, not the whole registry, so a
  // tenant page cannot bounce a user to another tenant's hostname.
  it("refuses a callbackURL on a different tenant", async () => {
    expect((await signIn({ origin: ACME }, { callbackURL: `${BOREALIS}/dashboard` })).status).toBe(403);
  });
});

describe("auth from anything that is not a registered tenant", () => {
  it.each(NOT_TENANTS)("refuses sign-in from %s", async (_label, origin) => {
    expect((await signIn({ origin })).status).toBe(403);
  });

  it.each(NOT_TENANTS)("refuses sign-up from %s", async (_label, origin) => {
    expect((await signUp({ origin })).status).toBe(403);
  });

  it("refuses a sign-out carrying a valid session cookie from an unregistered origin", async () => {
    const cookie = await sessionCookie();

    expect((await signOut({ origin: "http://evil-acme.localhost:3000", cookie })).status).toBe(403);
  });

  it("refuses a lookalike Referer when the browser sent no Origin", async () => {
    expect((await signIn({ referer: "http://acme.localhost.evil.test:3000/auth/login" })).status).toBe(403);
  });
});

describe("the fixed trusted origins keep working", () => {
  it("signs in from FRONTEND_URL, which has no domain row here", async () => {
    expect((await signIn({ origin: env.FRONTEND_URL })).status).toBe(200);
  });

  it("signs in from the mobile app scheme", async () => {
    expect((await signIn({ expoOrigin: env.MOBILE_APP_SCHEME })).status).toBe(200);
  });

  it("signs in from an Expo dev client outside production", async () => {
    expect((await signIn({ expoOrigin: "exp://192.168.0.10:8081" })).status).toBe(200);
  });
});

describe("CORS", () => {
  it("reflects a registered tenant origin exactly, with credentials", async () => {
    const response = await preflight(ACME);

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(ACME);
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    expect(response.headers.get("vary")).toContain("Origin");
  });

  it("reflects FRONTEND_URL", async () => {
    const response = await preflight(env.FRONTEND_URL);

    expect(response.headers.get("access-control-allow-origin")).toBe(env.FRONTEND_URL);
  });

  it.each(NOT_TENANTS)("sends no Access-Control-Allow-Origin to %s", async (_label, origin) => {
    const response = await preflight(origin);

    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  // A browser never serializes an origin with a path; echoing one back would
  // mean the header was reflected without being matched.
  it("does not reflect a non-canonical spelling of a registered origin", async () => {
    const response = await preflight(`${ACME}/`);

    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("allows a tenant origin on an ordinary request, not only the preflight", async () => {
    const response = await app.fetch(
      new Request(new URL("/api/health", API), { headers: { Origin: BOREALIS } })
    );

    expect(response.headers.get("access-control-allow-origin")).toBe(BOREALIS);
  });
});

describe("the hostname registry cache", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("trusts a newly provisioned hostname once the TTL passes, without a restart", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const origin = "http://late.localhost:3000";

    // Loads the registry before the row exists.
    invalidateTenantOrigins();
    expect((await preflight(origin)).headers.get("access-control-allow-origin")).toBeNull();

    await registerHostname("late.localhost");
    // Still inside the TTL: the answer comes from the cache, not a query.
    expect((await preflight(origin)).headers.get("access-control-allow-origin")).toBeNull();

    vi.setSystemTime(Date.now() + TENANT_HOSTNAMES_TTL_MS + 1);
    expect((await preflight(origin)).headers.get("access-control-allow-origin")).toBe(origin);
  });
});
