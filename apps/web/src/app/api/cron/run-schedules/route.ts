import { NextResponse } from "next/server";

/**
 * Daily trigger for scheduled simulations, invoked by Vercel Cron (see
 * `vercel.json`). It only forwards the call: the optimizer, database and email
 * all live in the API, which answers 202 and does the work in the background.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** A spun-down free Render instance can take about a minute to wake. */
const ATTEMPT_TIMEOUT_MS = 120_000;
const ATTEMPTS = 2;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiUrl = process.env.API_URL;
  const internalSecret = process.env.INTERNAL_API_SECRET;
  if (!apiUrl || !internalSecret) {
    console.error("[cron] API_URL or INTERNAL_API_SECRET is not configured");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${apiUrl}/api/internal/run-schedules`, {
        method: "POST",
        headers: { Authorization: `Bearer ${internalSecret}` },
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
        cache: "no-store",
      });
      // A 4xx will not fix itself on retry (wrong secret); report it as is.
      if (res.ok || res.status < 500) {
        const body = await res.json().catch(() => null);
        return NextResponse.json({ status: res.status, body }, { status: res.ok ? 200 : 502 });
      }
      lastError = new Error(`API responded ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    console.warn(`[cron] attempt ${attempt} failed`, lastError);
  }

  console.error("[cron] giving up on run-schedules", lastError);
  return NextResponse.json({ error: "API unreachable" }, { status: 502 });
}
