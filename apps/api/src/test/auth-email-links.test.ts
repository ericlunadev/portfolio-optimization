// PLAN Task 1.0: the password-reset and verification emails link to the tenant
// host the request came from and carry that tenant's product name — and a header
// an attacker controls never becomes the host of a link.
//
// Everything goes through the composed app and the genuine BetterAuth endpoints,
// with the headers a browser (or a forger with curl) sends. `sendEmail` is
// replaced, so nothing is sent: each test reads back the link and the rendered
// HTML of the message the app tried to send.

import { randomUUID } from "node:crypto";
import { render } from "@react-email/render";
import type { ReactElement } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type SentEmail = { to: string; subject: string; react: ReactElement };

const sent = vi.hoisted(() => [] as SentEmail[]);

vi.mock("../lib/email/send.js", () => ({
  sendEmail: async (email: SentEmail) => {
    sent.push(email);
  },
}));

const { default: app } = await import("../app.js");
const { env } = await import("../config/env.js");
const { db } = await import("../db/index.js");
const { eq } = await import("drizzle-orm");
const { organization, organizationBranding, organizationDomain } = await import("../db/schema.js");
const { invalidateTenantOrigins } = await import("../lib/trusted-origins.js");
const { seedOrg } = await import("./factories.js");

const API = "http://api.test";
const PASSWORD = "correct-horse-battery";

const ACME = "http://acme.localhost:3000";
const ACME_PRODUCT = "Acme Portfolio Lab";
// A second hostname on the default tenant, so a link to it cannot be mistaken for
// the FRONTEND_URL fallback.
const DEFAULT_SITE = "http://www.localhost:3000";
const ATTACKER = "evil.test";

// Built from a registered name, which a suffix, substring or wildcard match
// would wrongly accept. None has a domain row.
const LOOKALIKES: [string, string][] = [
  ["a registered name at the end of another label", "http://evil-acme.localhost:3000"],
  ["a registered name followed by another domain", "http://acme.localhost.evil.test:3000"],
  ["a subdomain of a registered name", "http://app.acme.localhost:3000"],
  ["a registered name with a trailing dot", "http://acme.localhost.:3000"],
];

let defaultProduct: string;

async function post(
  path: string,
  json: unknown,
  headers: Record<string, string> = {},
  base = API
): Promise<Response> {
  const request = new Request(new URL(path, base), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(json),
  });
  return app.fetch(request);
}

/** A fresh, unverified account, created with no Origin so it does not depend on the code under test. */
async function signUp(): Promise<string> {
  const email = `analyst-${randomUUID()}@example.com`;
  const response = await post("/api/auth/sign-up/email", { email, password: PASSWORD, name: "Lucía" });
  expect(response.status).toBe(200);
  // Signing up already sent a verification email; each test triggers its own.
  sent.length = 0;
  return email;
}

/**
 * The one email the app tried to send since the last reset: its rendered HTML,
 * and the token link read out of that HTML — what the recipient actually clicks.
 */
async function onlyEmail(): Promise<{ email: SentEmail; url: string; html: string }> {
  expect(sent).toHaveLength(1);
  const [email] = sent;
  const html = await render(email.react);

  const links = [...html.matchAll(/href="([^"]+)"/g)]
    .map((match) => match[1].replaceAll("&amp;", "&"))
    .filter((href) => href.includes("token="));
  // The button and the copy-paste fallback carry the same link.
  expect(links.length).toBeGreaterThan(0);
  expect(new Set(links).size).toBe(1);

  return { email, url: links[0], html };
}

async function requestReset(headers: Record<string, string>, base = API) {
  const email = await signUp();
  const response = await post("/api/auth/request-password-reset", { email }, headers, base);
  expect(response.status).toBe(200);
  return onlyEmail();
}

async function requestVerification(headers: Record<string, string>) {
  const email = await signUp();
  const response = await post("/api/auth/send-verification-email", { email }, headers);
  expect(response.status).toBe(200);
  return onlyEmail();
}

beforeAll(async () => {
  const acme = await seedOrg({ tier: "whitelabel" });
  await db.insert(organizationBranding).values({
    organizationId: acme.id,
    productName: ACME_PRODUCT,
    productShortName: "Acme",
  });
  await db.insert(organizationDomain).values({
    id: `domain-${randomUUID()}`,
    organizationId: acme.id,
    hostname: "acme.localhost",
  });

  // Migration 0008 creates the default tenant and its branding in every database.
  const defaultOrg = await db.query.organization.findFirst({ where: eq(organization.isDefault, true) });
  const defaultBranding = await db.query.organizationBranding.findFirst({
    where: eq(organizationBranding.organizationId, defaultOrg!.id),
  });
  defaultProduct = defaultBranding!.productName!;
  await db.insert(organizationDomain).values({
    id: `domain-${randomUUID()}`,
    organizationId: defaultOrg!.id,
    hostname: "www.localhost",
  });

  invalidateTenantOrigins();
});

beforeEach(() => {
  sent.length = 0;
});

describe("an email requested from a tenant host", () => {
  it("links a password reset to that host and names its product", async () => {
    const { url, html } = await requestReset({ Origin: ACME });

    expect(url).toMatch(new RegExp(`^${ACME}/auth/reset-password\\?token=[^&]+$`));
    expect(html).toContain(ACME_PRODUCT);
    expect(html).not.toContain(defaultProduct);
  });

  it("links a verification email to that host and names its product", async () => {
    const { url, html } = await requestVerification({ Origin: ACME });

    expect(url).toMatch(new RegExp(`^${ACME}/auth/verify-email\\?token=[^&]+$`));
    expect(html).toContain(ACME_PRODUCT);
    expect(html).not.toContain(defaultProduct);
  });

  it("links the verification email sent on sign-up to that host", async () => {
    const email = `analyst-${randomUUID()}@example.com`;
    const response = await post(
      "/api/auth/sign-up/email",
      { email, password: PASSWORD, name: "Lucía" },
      { Origin: ACME }
    );
    expect(response.status).toBe(200);

    const { url, html } = await onlyEmail();
    expect(url.startsWith(`${ACME}/auth/verify-email?token=`)).toBe(true);
    expect(html).toContain(ACME_PRODUCT);
  });

  it("falls back to the Referer when there is no Origin, as BetterAuth does", async () => {
    const { url } = await requestReset({ Referer: `${ACME}/auth/forgot-password` });

    expect(url.startsWith(`${ACME}/auth/reset-password?token=`)).toBe(true);
  });

});

describe("an email requested from the default tenant", () => {
  it("links to a trusted default-site origin it came from", async () => {
    const { url, html } = await requestReset({ Origin: DEFAULT_SITE });

    expect(url.startsWith(`${DEFAULT_SITE}/auth/reset-password?token=`)).toBe(true);
    expect(html).toContain(defaultProduct);
  });

  it("links to FRONTEND_URL when the request came from it", async () => {
    const { url } = await requestReset({ Origin: env.FRONTEND_URL });

    expect(url.startsWith(`${env.FRONTEND_URL}/auth/reset-password?token=`)).toBe(true);
  });

  it("links to FRONTEND_URL, with the default tenant's name, when there is no Origin or Referer", async () => {
    const reset = await requestReset({});
    expect(reset.url.startsWith(`${env.FRONTEND_URL}/auth/reset-password?token=`)).toBe(true);
    expect(reset.html).toContain(defaultProduct);

    const verification = await requestVerification({});
    expect(verification.url.startsWith(`${env.FRONTEND_URL}/auth/verify-email?token=`)).toBe(true);
  });
});

describe("a forged header", () => {
  it("never puts a forged Host or X-Forwarded-Host in a reset link", async () => {
    const headers = { Host: ATTACKER, "X-Forwarded-Host": ATTACKER, "X-Forwarded-Proto": "https" };
    // The Node server builds the request URL from Host, so the URL is forged too.
    const { url, html } = await requestReset(headers, `http://${ATTACKER}`);

    expect(url.startsWith(`${env.FRONTEND_URL}/auth/reset-password?token=`)).toBe(true);
    expect(html).not.toContain(ATTACKER);
  });

  it("never puts a forged Host or X-Forwarded-Host in a link, even beside a genuine tenant Origin", async () => {
    const { url } = await requestReset({ Origin: ACME, Host: ATTACKER, "X-Forwarded-Host": ATTACKER });

    expect(url.startsWith(`${ACME}/auth/reset-password?token=`)).toBe(true);
  });

  it("never puts a forged Host or X-Forwarded-Host in a verification link", async () => {
    const { url } = await requestVerification({ Host: ATTACKER, "X-Forwarded-Host": ATTACKER });

    expect(url).not.toContain(ATTACKER);
    expect(url.startsWith(`${env.FRONTEND_URL}/auth/verify-email?token=`)).toBe(true);
  });

  it("never links to an unregistered Origin", async () => {
    const { url, html } = await requestReset({ Origin: `http://${ATTACKER}:3000` });

    expect(url.startsWith(`${env.FRONTEND_URL}/auth/reset-password?token=`)).toBe(true);
    expect(html).not.toContain(ATTACKER);
  });

  it.each(LOOKALIKES)("never links a reset to %s", async (_label, origin) => {
    const { url, html } = await requestReset({ Origin: origin });

    expect(url.startsWith(`${env.FRONTEND_URL}/auth/reset-password?token=`)).toBe(true);
    expect(html).not.toContain(new URL(origin).host);
    expect(html).not.toContain(ACME_PRODUCT);
  });

  it.each(LOOKALIKES)("never links a verification to %s", async (_label, origin) => {
    const { url } = await requestVerification({ Origin: origin });

    expect(url.startsWith(`${env.FRONTEND_URL}/auth/verify-email?token=`)).toBe(true);
  });

  it("never links to a lookalike Referer", async () => {
    const { url } = await requestReset({ Referer: "http://acme.localhost.evil.test:3000/auth/forgot-password" });

    expect(url.startsWith(`${env.FRONTEND_URL}/auth/reset-password?token=`)).toBe(true);
  });
});
