// PLAN Tasks 1.1/1.3/1.4 — the server-side tenant lookup and the brand values
// it carries.
//
// The failure this file exists to prevent is a tenant seeing another tenant's
// brand, so the fetch tests care as much about what is *keyed* per host as about
// what comes back. The rest pins down the two degradations Task 1.1 requires: an
// unknown host and an unreachable API both land on our own brand rather than an
// error.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearTenantConfigCache,
  DEFAULT_TENANT_CONFIG,
  fetchTenantConfig,
  normalizeHostname,
  tenantConfigFromResponse,
  tenantPaletteCss,
} from "./tenant-config";

const fetchMock = vi.fn();

function tenantPayload(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: "org-acme",
    slug: "acme",
    tier: "whitelabel",
    isDefault: false,
    branding: {
      productName: "Acme Wealth",
      productShortName: "Acme",
      tagline: "Gestión patrimonial",
      accentHex: "#2f6fed",
      fontKey: "manrope",
      logoUrl: "/tenants/acme/logo.svg",
      faviconUrl: "/tenants/acme/favicon.png",
    },
    ...overrides,
  };
}

/** The answer an unknown host gets: the API resolves the default tenant itself. */
function defaultTenantPayload() {
  return {
    organizationId: "org-d2c",
    slug: "d2c",
    tier: "cobranded",
    isDefault: true,
    branding: { productName: null, accentHex: null },
  };
}

beforeEach(() => {
  clearTenantConfigCache();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  delete process.env.API_URL;
  delete process.env.NEXT_PUBLIC_API_URL;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("normalizeHostname", () => {
  it.each([
    ["ACME.optim.app", "acme.optim.app"],
    ["acme.optim.app:3000", "acme.optim.app"],
    ["acme.optim.app.", "acme.optim.app"],
    ["  acme.optim.app  ", "acme.optim.app"],
    ["localhost:3000", "localhost"],
    // `x-forwarded-host` can carry a proxy chain; the client's host is first.
    ["acme.optim.app, internal.vercel.app", "acme.optim.app"],
    ["[::1]:3000", "[::1]"],
  ])("normalizes %j to %j", (raw, expected) => {
    expect(normalizeHostname(raw)).toBe(expected);
  });

  it("has nothing to resolve for a missing host", () => {
    expect(normalizeHostname(null)).toBeNull();
    expect(normalizeHostname("")).toBeNull();
    expect(normalizeHostname(":3000")).toBeNull();
  });
});

describe("fetchTenantConfig", () => {
  it("resolves two hostnames to two different tenants", async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        Response.json(
          url.includes("acme")
            ? tenantPayload()
            : tenantPayload({
                organizationId: "org-borealis",
                slug: "borealis",
                tier: "cobranded",
                branding: { productName: "Borealis", accentHex: "#8b5cf6" },
              })
        )
      )
    );

    const acme = await fetchTenantConfig("acme.optim.app");
    const borealis = await fetchTenantConfig("borealis.optim.app");

    expect(acme.organizationId).toBe("org-acme");
    expect(acme.brand.fullName).toBe("Acme Wealth");
    expect(acme.accentHex).toBe("#2f6fed");
    expect(acme.tier).toBe("whitelabel");

    expect(borealis.organizationId).toBe("org-borealis");
    expect(borealis.brand.fullName).toBe("Borealis");
    expect(borealis.accentHex).toBe("#8b5cf6");
    expect(borealis.tier).toBe("cobranded");
  });

  it("asks the API for the exact host it was given", async () => {
    fetchMock.mockResolvedValue(Response.json(tenantPayload()));

    await fetchTenantConfig("ACME.optim.app:3000");

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "http://localhost:8001/api/tenants/by-host?host=acme.optim.app"
    );
  });

  it("serves whatever the API resolves for an unknown host — the default tenant", async () => {
    fetchMock.mockResolvedValue(Response.json(defaultTenantPayload()));

    const tenant = await fetchTenantConfig("nobody.optim.app");

    expect(tenant.organizationId).toBe("org-d2c");
    // No branding row of its own, so the wordmark stays ours.
    expect(tenant.brand).toEqual(DEFAULT_TENANT_CONFIG.brand);
    expect(tenant.accentHex).toBeNull();
  });

  it("falls back to our own brand when the API is unreachable", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    expect(await fetchTenantConfig("acme.optim.app")).toEqual(DEFAULT_TENANT_CONFIG);
  });

  it("falls back to our own brand when the API errors", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 503 }));

    expect(await fetchTenantConfig("acme.optim.app")).toEqual(DEFAULT_TENANT_CONFIG);
  });

  it("does not call the API at all with no host to resolve", async () => {
    expect(await fetchTenantConfig(null)).toEqual(DEFAULT_TENANT_CONFIG);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caches per host, and never serves one host's answer to another", async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        Response.json(
          url.includes("acme")
            ? tenantPayload()
            : tenantPayload({ organizationId: "org-borealis", branding: { productName: "Borealis" } })
        )
      )
    );

    const first = await fetchTenantConfig("acme.optim.app");
    const other = await fetchTenantConfig("borealis.optim.app");
    const again = await fetchTenantConfig("acme.optim.app");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(again).toEqual(first);
    expect(other.organizationId).toBe("org-borealis");
  });

  it("collapses concurrent lookups of the same host into one request", async () => {
    fetchMock.mockResolvedValue(Response.json(tenantPayload()));

    const [a, b] = await Promise.all([
      fetchTenantConfig("acme.optim.app"),
      fetchTenantConfig("acme.optim.app"),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });

  it("uses API_URL ahead of the public variable", async () => {
    process.env.API_URL = "https://api.internal.test";
    process.env.NEXT_PUBLIC_API_URL = "https://api.public.test";
    fetchMock.mockResolvedValue(Response.json(tenantPayload()));

    await fetchTenantConfig("acme.optim.app");

    expect(String(fetchMock.mock.calls[0][0])).toContain("https://api.internal.test/api/tenants/by-host");
  });
});

describe("tenantConfigFromResponse", () => {
  it("gives a tenant with only an accent our wordmark and their colour", () => {
    const config = tenantConfigFromResponse(
      tenantPayload({ branding: { accentHex: "#2f6fed" } })
    );

    expect(config.brand).toEqual(DEFAULT_TENANT_CONFIG.brand);
    expect(config.accentHex).toBe("#2f6fed");
  });

  it("makes the product name the whole wordmark and the tab title", () => {
    const config = tenantConfigFromResponse(
      tenantPayload({ branding: { productName: "Acme Wealth", tagline: "Gestión patrimonial" } })
    );

    expect(config.brand.shortName).toBe("");
    expect(config.brand.fullName).toBe("Acme Wealth");
    expect(config.brand.title).toBe("Acme Wealth");
    expect(config.brand.description).toBe("Gestión patrimonial");
  });

  it("keeps the two-part wordmark when a tenant sets both halves", () => {
    const config = tenantConfigFromResponse(tenantPayload());

    expect(config.brand.shortName).toBe("Acme");
    expect(config.brand.fullName).toBe("Acme Wealth");
  });

  it("treats an unusable payload as no tenant at all", () => {
    expect(tenantConfigFromResponse(null)).toEqual(DEFAULT_TENANT_CONFIG);
    expect(tenantConfigFromResponse("acme")).toEqual(DEFAULT_TENANT_CONFIG);
    expect(tenantConfigFromResponse({ slug: "acme" })).toEqual(DEFAULT_TENANT_CONFIG);
  });

  it("does not take an unrecognised tier at face value", () => {
    expect(tenantConfigFromResponse(tenantPayload({ tier: "enterprise" })).tier).toBe("cobranded");
  });
});

describe("tenantPaletteCss", () => {
  const light = { "--primary": "220 84% 34%", "--ring": "220 84% 40%" };
  const dark = { "--primary": "220 84% 62%" };

  it("overrides :root and .dark, the two blocks globals.css defines", () => {
    const css = tenantPaletteCss(light, dark);

    expect(css).toBe(":root{--primary:220 84% 34%;--ring:220 84% 40%;}.dark{--primary:220 84% 62%;}");
  });

  it("emits nothing for an empty appearance rather than a stray empty rule", () => {
    expect(tenantPaletteCss({}, {})).toBe("");
  });

  it("drops a value that could close the style element", () => {
    // The accent starts life as text an owner typed into a settings form, so it
    // reaches the <style> untrusted however well-derived the palette is.
    const css = tenantPaletteCss(
      { "--primary": "</style><script>alert(1)</script>", "--ring": "220 84% 40%" },
      {}
    );

    expect(css).not.toContain("script");
    expect(css).toBe(":root{--ring:220 84% 40%;}");
  });

  it("drops a value that would smuggle in a second declaration", () => {
    expect(tenantPaletteCss({ "--primary": "red;background:url(x)" }, {})).toBe("");
  });

  it("drops a token that is not a custom property", () => {
    expect(tenantPaletteCss({ "background": "red" }, {})).toBe("");
  });
});
