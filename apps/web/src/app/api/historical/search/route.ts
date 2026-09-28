import { NextRequest, NextResponse } from "next/server";

// The ticker search exists twice, and this copy stays publicly reachable at
// https://<tenant-host>/api/historical/search whatever NEXT_PUBLIC_API_URL is
// set to. Filtering only the Hono handler would leave a tenant's fund allowlist
// (PLAN Task 3.1) bypassable by hand from the tenant's own app, so this copy has
// to honour it too.
//
// It cannot apply the allowlist itself. `apps/web` has no database client and no
// BetterAuth server instance, so it can neither read `organization_settings` nor
// verify the session cookie that names the caller, and resolving the tenant from
// the Host header would need a trusted host-to-organization channel that does
// not exist until PLAN Task 1.1. So it forwards the request — credentials
// included — to the one handler that can resolve the tenant, and returns that
// answer verbatim. PLAN §3.2 names a route handler like this as the supported
// proxy shape; it was Vercel's `rewrites()` that failed in production (commit
// 85f1740), not a server-side fetch.
//
// **Fail closed.** When the upstream cannot be reached the answer is an empty
// list — the same shape a Yahoo failure has always produced — never an
// unfiltered Yahoo result. Today's D2C behaviour is unaffected: production
// browsers do not take this path at all (NEXT_PUBLIC_API_URL sends them straight
// to the API host) and local dev already requires the API on :8001.

// Same precedence as the `rewrites()` block in next.config.js, plus
// NEXT_PUBLIC_API_URL for a deployment that only configures the public one.
function apiBaseUrl(): string {
  return process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";
}

// The only headers the upstream needs to identify the caller. Everything else is
// deliberately dropped: the API must never be able to take tenancy from a header
// this handler could be talked into forwarding.
const FORWARDED_HEADERS = ["cookie", "authorization"];

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const q = searchParams.get("q");

  if (!q || q.length < 1) {
    return NextResponse.json({ error: "Query parameter 'q' is required" }, { status: 400 });
  }

  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  try {
    const upstream = await fetch(
      `${apiBaseUrl()}/api/historical/search?q=${encodeURIComponent(q)}`,
      { headers, cache: "no-store" }
    );

    if (!upstream.ok) {
      console.error(`Ticker search upstream responded ${upstream.status}`);
      return NextResponse.json([]);
    }

    return NextResponse.json(await upstream.json());
  } catch (error) {
    console.error("Ticker search upstream error:", error);
    return NextResponse.json([]);
  }
}
