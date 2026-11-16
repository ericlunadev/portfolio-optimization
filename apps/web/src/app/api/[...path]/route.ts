import type { NextRequest } from "next/server";

// Same-origin proxy for the API: every `/api/*` request the browser makes on a
// tenant host is forwarded from here to the API (`API_URL`), and the answer —
// Set-Cookie included — comes back as this host's own response.
//
// **Why it exists: sessions per tenant.** BetterAuth's session cookie is
// host-only. Served through this proxy it belongs to the tenant host the user
// signed in on (`brio.prontofolio.com`, `prontofolio.com`, …), so each tenant has
// its own session. Calling the API's domain directly made the cookie the API
// domain's, shared by every tenant (see lib/api-base.ts).
//
// **Why not `rewrites()`.** Vercel refuses to proxy a rewrite to Render with
// DNS_HOSTNAME_RESOLVED_PRIVATE (commit 85f1740; still true on 2026-11-16). A
// server-side fetch is not affected — the cron and ticker-search routes already
// reach the API this way.
//
// The more specific routes beside this one (cron, historical/search, locale,
// theme) still win: Next.js only falls through to a catch-all when nothing
// else matches.

export const dynamic = "force-dynamic";
// The API runs on a free Render instance whose cold start takes about a minute.
export const maxDuration = 120;

function apiBaseUrl(): string {
  return process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";
}

// Request headers the API reads. An allowlist on purpose: the web middleware
// adds `x-org-id` / `x-org-slug` / `x-tenant-host` to the request, and the API
// must never take tenancy from a header this proxy could be talked into passing.
const REQUEST_HEADERS = [
  "accept",
  "accept-language",
  "authorization",
  "content-type",
  "cookie",
  "idempotency-key",
  // BetterAuth's origin check, trusted origins and tenant email links read these.
  "origin",
  "referer",
  "user-agent",
  // The client's IP, set by Vercel's edge, so BetterAuth rate-limits per user
  // rather than per Vercel function.
  "x-forwarded-for",
] as const;

// Response headers that describe the upstream connection rather than the
// content. `fetch` has already decoded the body, so its encoding and length no
// longer apply.
const DROPPED_RESPONSE_HEADERS = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "keep-alive",
  "transfer-encoding",
  "set-cookie", // re-added one by one below; Headers would fold them into one line
]);

async function proxy(request: NextRequest): Promise<Response> {
  const target = new URL(request.nextUrl.pathname + request.nextUrl.search, apiBaseUrl());

  const headers = new Headers();
  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      cache: "no-store",
      // Pass redirects through (e.g. email verification), don't follow them here.
      redirect: "manual",
    });
  } catch (error) {
    console.error(`[api-proxy] ${request.method} ${target.pathname} unreachable:`, error);
    return Response.json({ error: "API unavailable" }, { status: 502 });
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, name) => {
    if (!DROPPED_RESPONSE_HEADERS.has(name.toLowerCase())) responseHeaders.set(name, value);
  });
  for (const cookie of upstream.headers.getSetCookie()) {
    responseHeaders.append("set-cookie", cookie);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
