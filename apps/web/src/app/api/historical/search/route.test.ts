// The Next copy of the ticker search (PLAN Task 3.1).
//
// This handler cannot resolve a tenant itself, so what these tests pin down is
// the two things that keep the fund allowlist unbypassable through it: it always
// asks the API (which can), forwarding the caller's credentials and nothing
// else, and it never falls back to an unfiltered Yahoo result when the API does
// not answer.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const ALLOWED = [{ symbol: "VOO", name: "Vanguard S&P 500 ETF", exchange: "PCX", type: "ETF" }];

const fetchMock = vi.fn();

function get(url: string, headers: Record<string, string> = {}): Promise<Response> {
  return GET(new NextRequest(new Request(url, { headers })));
}

function upstreamUrl(): string {
  return String(fetchMock.mock.calls[0][0]);
}

function upstreamHeaders(): Headers {
  return (fetchMock.mock.calls[0][1] as { headers: Headers }).headers;
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(Response.json(ALLOWED));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  delete process.env.API_URL;
  delete process.env.NEXT_PUBLIC_API_URL;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GET /api/historical/search", () => {
  it("rejects a request with no query", async () => {
    const res = await get("https://acme.optim.app/api/historical/search");

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the API's filtered answer rather than searching Yahoo itself", async () => {
    const res = await get("https://acme.optim.app/api/historical/search?q=van");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(ALLOWED);
    expect(upstreamUrl()).toBe("http://localhost:8001/api/historical/search?q=van");
  });

  it("escapes the query it forwards", async () => {
    await get("https://acme.optim.app/api/historical/search?q=s%26p 500");

    expect(upstreamUrl()).toBe("http://localhost:8001/api/historical/search?q=s%26p%20500");
  });

  it("forwards the caller's credentials so the API can resolve their organization", async () => {
    await get("https://acme.optim.app/api/historical/search?q=van", {
      cookie: "better-auth.session_token=abc",
      authorization: "Bearer abc",
    });

    expect(upstreamHeaders().get("cookie")).toBe("better-auth.session_token=abc");
    expect(upstreamHeaders().get("authorization")).toBe("Bearer abc");
  });

  it("forwards nothing the API could mistake for tenancy", async () => {
    await get("https://acme.optim.app/api/historical/search?q=van", {
      "x-org-id": "org-someone-elses",
      "x-forwarded-host": "unrestricted.optim.app",
    });

    expect(upstreamHeaders().get("x-org-id")).toBeNull();
    expect(upstreamHeaders().get("x-forwarded-host")).toBeNull();
    expect(upstreamHeaders().get("host")).toBeNull();
  });

  it("prefers API_URL, then NEXT_PUBLIC_API_URL, for the upstream", async () => {
    process.env.NEXT_PUBLIC_API_URL = "https://public.example.com";
    await get("https://acme.optim.app/api/historical/search?q=van");
    expect(upstreamUrl()).toBe("https://public.example.com/api/historical/search?q=van");

    fetchMock.mockClear();
    process.env.API_URL = "https://api.example.com";
    await get("https://acme.optim.app/api/historical/search?q=van");
    expect(upstreamUrl()).toBe("https://api.example.com/api/historical/search?q=van");
  });

  it("fails closed when the API is unreachable", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await get("https://acme.optim.app/api/historical/search?q=van");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("fails closed when the API refuses the request", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 500 }));

    const res = await get("https://acme.optim.app/api/historical/search?q=van");

    expect(await res.json()).toEqual([]);
  });
});
