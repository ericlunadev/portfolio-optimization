// Task 0.8: a real BetterAuth signup must come out the other side with a complete
// personal organization.
//
// This is the one test in the suite that drives the genuine sign-up endpoint and
// the genuine Set-Cookie it returns, rather than the `asUser` session stub. It is
// deliberately end-to-end: `authMiddleware` throws 500 for a user with no
// `organization_member` row, so provisioning failing silently would turn every
// new account into a broken one, and the stub would never notice.
//
// `sendOnSignUp` is on and `lib/email/client.ts` throws without RESEND_API_KEY,
// so both are neutralised before the app is imported.

import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

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
const { db } = await import("../db/index.js");
const {
  organization,
  organizationBranding,
  organizationDomain,
  organizationMember,
  organizationSettings,
} = await import("../db/schema.js");

const ORIGIN = "http://api.test";

async function signUp(email: string): Promise<Response> {
  return app.fetch(
    new Request(new URL("/api/auth/sign-up/email", ORIGIN), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "correct-horse-battery", name: email }),
    })
  );
}

async function membershipFor(userId: string) {
  return db.query.organizationMember.findFirst({
    where: eq(organizationMember.userId, userId),
  });
}

describe("signup provisioning", () => {
  let userId: string;

  beforeAll(async () => {
    const response = await signUp("provisioned@example.com");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { user: { id: string } };
    userId = body.user.id;
  });

  it("creates exactly one owner membership", async () => {
    const member = await membershipFor(userId);
    expect(member).toBeDefined();
    expect(member?.role).toBe("owner");

    const all = await db
      .select()
      .from(organizationMember)
      .where(eq(organizationMember.userId, userId));
    expect(all).toHaveLength(1);
  });

  it("derives the slug the way migration 0007 does", async () => {
    const member = await membershipFor(userId);
    const org = await db.query.organization.findFirst({
      where: eq(organization.id, member!.organizationId),
    });
    // Not the email local-part: real local-parts contain dots and plus signs,
    // which are not valid single DNS labels under a wildcard certificate.
    expect(org?.slug).toBe(`u-${userId.toLowerCase()}`);
    expect(org?.tier).toBe("cobranded");
    expect(org?.isDefault).toBe(false);
  });

  // The regression this guards: settings written from schema.ts's column defaults
  // instead of the D2C set would silently hide the advisor CTA and the crypto rail
  // for every new account, breaking Phase 0's "zero user-visible change" bar.
  it("writes the D2C behaviour set, not the whitelabel column defaults", async () => {
    const member = await membershipFor(userId);
    const settings = await db.query.organizationSettings.findFirst({
      where: eq(organizationSettings.organizationId, member!.organizationId),
    });
    expect(settings?.advisorMode).toBe("platform");
    expect(settings?.cryptoRailEnabled).toBe(true);
    expect(settings?.signupGrantCredits).toBe(3);
  });

  it("leaves the branding fields that need a human decision null", async () => {
    const member = await membershipFor(userId);
    const branding = await db.query.organizationBranding.findFirst({
      where: eq(organizationBranding.organizationId, member!.organizationId),
    });
    expect(branding).toBeDefined();
    expect(branding?.supportEmail).toBeNull();
    expect(branding?.privacyPolicyUrl).toBeNull();
    expect(branding?.termsUrl).toBeNull();
  });

  it("creates no domain row — a personal org reaches the app through the default tenant", async () => {
    const member = await membershipFor(userId);
    const domains = await db
      .select()
      .from(organizationDomain)
      .where(eq(organizationDomain.organizationId, member!.organizationId));
    expect(domains).toHaveLength(0);
  });

  it("gives a second signup its own organization", async () => {
    const response = await signUp("second@example.com");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { user: { id: string } };

    const first = await membershipFor(userId);
    const second = await membershipFor(body.user.id);
    expect(second?.organizationId).not.toBe(first?.organizationId);
  });

  // The point of all of the above: the account actually works. authMiddleware
  // resolves the tenant from the membership row and 500s when there is none, so
  // this is the assertion that would have caught the original blocker.
  it("serves an authenticated request with the real session cookie", async () => {
    const response = await signUp("cookie@example.com");
    const cookies = response.headers
      .getSetCookie()
      .map((entry) => entry.split(";")[0])
      .join("; ");
    expect(cookies).not.toBe("");

    const authenticated = await app.fetch(
      new Request(new URL("/api/simulations", ORIGIN), { headers: { Cookie: cookies } })
    );
    expect(authenticated.status).toBe(200);
  });
});
