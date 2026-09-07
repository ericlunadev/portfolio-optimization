// PLAN Task 1.1 — the `Host` header becomes an organization.
//
// `NextResponse.next({ request: { headers } })` does not mutate the incoming
// request; it encodes the rewritten headers on the response, which is what the
// Next runtime replays into the render. `requestHeaders` below decodes that
// encoding so the assertions read as "what the root layout will see".

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";
import { clearTenantConfigCache } from "@/lib/tenant-config";

const fetchMock = vi.fn();

const ACME = {
  organizationId: "org-acme",
  slug: "acme",
  tier: "whitelabel",
  isDefault: false,
  branding: { productName: "Acme Wealth", accentHex: "#2f6fed" },
};

const BOREALIS = {
  organizationId: "org-borealis",
  slug: "borealis",
  tier: "cobranded",
  isDefault: false,
  branding: { productName: "Borealis" },
};

/** What the API answers for a host with no `organization_domain` row. */
const DEFAULT_TENANT = {
  organizationId: "org-d2c",
  slug: "d2c",
  tier: "cobranded",
  isDefault: true,
  branding: {},
};

function run(host: string, extraHeaders: Record<string, string> = {}) {
  return middleware(
    new NextRequest(new Request(`https://${host}/efficient-frontier`, { headers: { host, ...extraHeaders } }))
  );
}

/** The headers Next will replay onto the request the layout renders from. */
function requestHeaders(response: Response): Headers {
  const overridden = response.headers.get("x-middleware-override-headers");
  const headers = new Headers();

  for (const name of overridden?.split(",") ?? []) {
    const key = name.trim();
    if (!key) continue;
    const value = response.headers.get(`x-middleware-request-${key}`);
    if (value !== null) headers.set(key, value);
  }

  return headers;
}

beforeEach(() => {
  clearTenantConfigCache();
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string) => {
    if (url.includes("host=acme.optim.app")) return Promise.resolve(Response.json(ACME));
    if (url.includes("host=borealis.optim.app")) return Promise.resolve(Response.json(BOREALIS));
    // Anything else is an unknown host, and the API resolves the default tenant.
    return Promise.resolve(Response.json(DEFAULT_TENANT));
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  delete process.env.API_URL;
  delete process.env.NEXT_PUBLIC_API_URL;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("tenant resolution middleware", () => {
  it("attaches two different organizations for two hostnames", async () => {
    const acme = requestHeaders(await run("acme.optim.app"));
    const borealis = requestHeaders(await run("borealis.optim.app"));

    expect(acme.get("x-org-id")).toBe("org-acme");
    expect(acme.get("x-org-slug")).toBe("acme");

    expect(borealis.get("x-org-id")).toBe("org-borealis");
    expect(borealis.get("x-org-slug")).toBe("borealis");
  });

  it("serves the default tenant for an unknown host instead of a 404", async () => {
    const response = await run("typo.optim.app");
    const headers = requestHeaders(response);

    expect(response.status).toBe(200);
    expect(headers.get("x-org-id")).toBe("org-d2c");
    expect(headers.get("x-org-slug")).toBe("d2c");
  });

  it("serves the request with our own brand when the lookup fails outright", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    const response = await run("acme.optim.app");
    const headers = requestHeaders(response);

    // No organization to name, and deliberately no error: the layout falls back
    // to DEFAULT_TENANT_CONFIG and the page still renders.
    expect(response.status).toBe(200);
    expect(headers.get("x-org-id")).toBeNull();
    expect(headers.get("x-tenant-host")).toBe("acme.optim.app");
  });

  it("passes the normalized host down so nothing downstream re-derives it", async () => {
    const headers = requestHeaders(await run("ACME.optim.app:3000"));

    expect(headers.get("x-tenant-host")).toBe("acme.optim.app");
    expect(headers.get("x-org-id")).toBe("org-acme");
  });

  it("prefers x-forwarded-host, which is what the proxy in front of us sets", async () => {
    const response = await middleware(
      new NextRequest(
        new Request("https://internal.vercel.app/", {
          headers: { host: "internal.vercel.app", "x-forwarded-host": "acme.optim.app" },
        })
      )
    );

    expect(requestHeaders(response).get("x-org-id")).toBe("org-acme");
  });

  it("strips a forged tenant header before writing its own", async () => {
    const headers = requestHeaders(
      await run("borealis.optim.app", {
        "x-org-id": "org-acme",
        "x-org-slug": "acme",
        "x-tenant-host": "acme.optim.app",
      })
    );

    expect(headers.get("x-org-id")).toBe("org-borealis");
    expect(headers.get("x-org-slug")).toBe("borealis");
    expect(headers.get("x-tenant-host")).toBe("borealis.optim.app");
  });

  it("leaves no tenant header behind when the lookup names no organization", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "No tenant configured" }, { status: 404 }));

    const headers = requestHeaders(await run("acme.optim.app", { "x-org-id": "org-acme" }));

    expect(headers.get("x-org-id")).toBeNull();
    expect(headers.get("x-org-slug")).toBeNull();
  });

  it("never redirects or refuses — branding follows the host, data follows the membership row", async () => {
    const response = await run("acme.optim.app");

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
