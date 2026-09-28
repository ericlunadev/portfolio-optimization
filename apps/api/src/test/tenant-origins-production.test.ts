// The production half of the scheme and port rule in lib/trusted-origins.ts:
// a registered tenant hostname is trusted over https on the default port only,
// except on loopback. tenant-origins.test.ts covers everything else.
//
// `isProduction` is derived from BACKEND_URL when config/env.ts first loads, so
// the URLs are set before any app module is imported, and put back afterwards.
//
// The account is written directly rather than through sign-up, which would send
// a verification email; sign-in is what this file is about.

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const savedEnv = { BACKEND_URL: process.env.BACKEND_URL, FRONTEND_URL: process.env.FRONTEND_URL };
process.env.BACKEND_URL = "https://api.optim.test";
process.env.FRONTEND_URL = "https://optim.test";

const { hashPassword } = await import("better-auth/crypto");
const { default: app } = await import("../app.js");
const { isProduction } = await import("../config/env.js");
const { db } = await import("../db/index.js");
const { account, organizationDomain, user } = await import("../db/schema.js");
const { invalidateTenantOrigins } = await import("../lib/trusted-origins.js");
const { seedOrg } = await import("./factories.js");

const API = "http://api.test";
const EMAIL = "analyst@acme.test";
const PASSWORD = "correct-horse-battery";

async function signIn(origin: string): Promise<Response> {
  return app.fetch(
    new Request(new URL("/api/auth/sign-in/email", API), {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    })
  );
}

async function allowedOrigin(origin: string): Promise<string | null> {
  const response = await app.fetch(
    new Request(new URL("/api/health", API), {
      method: "OPTIONS",
      headers: { Origin: origin, "Access-Control-Request-Method": "GET" },
    })
  );
  return response.headers.get("access-control-allow-origin");
}

beforeAll(async () => {
  const org = await seedOrg();
  for (const hostname of ["acme.optim.app", "acme.localhost"]) {
    await db.insert(organizationDomain).values({
      id: `domain-${randomUUID()}`,
      organizationId: org.id,
      hostname,
    });
  }
  invalidateTenantOrigins();

  const now = new Date();
  const userId = `user-${randomUUID()}`;
  await db.insert(user).values({
    id: userId,
    name: "Lucía Fernández",
    email: EMAIL,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(account).values({
    id: `account-${randomUUID()}`,
    accountId: userId,
    providerId: "credential",
    userId,
    password: await hashPassword(PASSWORD),
    createdAt: now,
    updatedAt: now,
  });
});

afterAll(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("tenant origins in production", () => {
  it("is running in production mode", () => {
    expect(isProduction).toBe(true);
  });

  it("signs in from a registered tenant over https", async () => {
    expect((await signIn("https://acme.optim.app")).status).toBe(200);
  });

  it("refuses the same registered hostname over plain http", async () => {
    expect((await signIn("http://acme.optim.app")).status).toBe(403);
  });

  it("refuses the same registered hostname on a non-default port", async () => {
    expect((await signIn("https://acme.optim.app:8443")).status).toBe(403);
  });

  it("still allows plain http on any port for a registered loopback hostname", async () => {
    expect((await signIn("http://acme.localhost:3000")).status).toBe(200);
  });

  it("signs in from FRONTEND_URL", async () => {
    expect((await signIn("https://optim.test")).status).toBe(200);
  });

  it("applies the same rule to CORS", async () => {
    expect(await allowedOrigin("https://acme.optim.app")).toBe("https://acme.optim.app");
    expect(await allowedOrigin("http://acme.optim.app")).toBeNull();
    expect(await allowedOrigin("https://acme.optim.app:8443")).toBeNull();
  });
});
