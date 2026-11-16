// The same-origin API proxy. What it must guarantee: sessions stay on the tenant
// host (Set-Cookie comes back intact, one header per cookie), the API sees what
// BetterAuth needs (cookie, origin, body, client IP), and the web middleware's
// tenant headers never reach the API.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";

const fetchMock = vi.fn();

function request(path: string, init: RequestInit & { headers?: Record<string, string> } = {}) {
  return new NextRequest(new Request(`https://brio.prontofolio.com${path}`, init));
}

function upstreamCall() {
  const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit & { headers: Headers }];
  return { url: String(url), init, headers: init.headers };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.env.API_URL = "https://api.internal.test";
  delete process.env.NEXT_PUBLIC_API_URL;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.API_URL;
});

describe("/api/[...path] proxy", () => {
  it("forwards the path and query to API_URL", async () => {
    fetchMock.mockResolvedValue(Response.json({ ok: true }));
    await GET(request("/api/tenants/by-host?host=brio.prontofolio.com"));
    expect(upstreamCall().url).toBe("https://api.internal.test/api/tenants/by-host?host=brio.prontofolio.com");
  });

  it("returns every Set-Cookie as its own header, so the session lands on this host", async () => {
    const upstream = new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    upstream.headers.append("set-cookie", "__Secure-better-auth.session_token=abc; Path=/; HttpOnly; Secure");
    upstream.headers.append("set-cookie", "__Secure-better-auth.session_data=xyz; Path=/; HttpOnly; Secure");
    fetchMock.mockResolvedValue(upstream);

    const res = await POST(request("/api/auth/sign-in/email", { method: "POST", body: "{}" }));

    expect(res.headers.getSetCookie()).toEqual([
      "__Secure-better-auth.session_token=abc; Path=/; HttpOnly; Secure",
      "__Secure-better-auth.session_data=xyz; Path=/; HttpOnly; Secure",
    ]);
    // Host-only: nothing in the proxy adds a Domain attribute.
    expect(res.headers.getSetCookie().join(";")).not.toMatch(/domain=/i);
  });

  it("passes the method, body and the headers BetterAuth reads", async () => {
    fetchMock.mockResolvedValue(Response.json({}));
    const body = JSON.stringify({ email: "a@b.test", password: "x" });

    await POST(
      request("/api/auth/sign-in/email", {
        method: "POST",
        body,
        headers: {
          "content-type": "application/json",
          cookie: "__Secure-better-auth.session_token=abc",
          origin: "https://brio.prontofolio.com",
          "x-forwarded-for": "203.0.113.7",
        },
      })
    );

    const { init, headers } = upstreamCall();
    expect(init.method).toBe("POST");
    expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe(body);
    expect(headers.get("cookie")).toBe("__Secure-better-auth.session_token=abc");
    expect(headers.get("origin")).toBe("https://brio.prontofolio.com");
    expect(headers.get("x-forwarded-for")).toBe("203.0.113.7");
  });

  it("never forwards the middleware's tenant headers", async () => {
    fetchMock.mockResolvedValue(Response.json({}));
    await GET(
      request("/api/simulations", {
        headers: { "x-org-id": "org-other", "x-org-slug": "other", "x-tenant-host": "other.prontofolio.com" },
      })
    );
    const { headers } = upstreamCall();
    expect(headers.get("x-org-id")).toBeNull();
    expect(headers.get("x-org-slug")).toBeNull();
    expect(headers.get("x-tenant-host")).toBeNull();
  });

  it("passes status and redirects through instead of following them", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 302, headers: { location: "/auth/verified" } }));
    const res = await GET(request("/api/auth/verify-email?token=t"));
    expect(upstreamCall().init.redirect).toBe("manual");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/auth/verified");
  });

  it("answers 502 when the API cannot be reached", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const res = await GET(request("/api/health"));
    expect(res.status).toBe(502);
  });
});
