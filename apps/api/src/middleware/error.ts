import type { Context, ErrorHandler, Next } from "hono";
import { HTTPException } from "hono/http-exception";

/**
 * `app.onError`: the one place a thrown error becomes a response.
 *
 * It has to be `onError` rather than a try/catch middleware: Hono resolves an
 * error thrown by a handler inside its own dispatch, so by the time a
 * middleware's `await next()` returns, a thrown HTTPException has already
 * become Hono's default *plain-text* response and never reaches the catch.
 * Clients parse error bodies as JSON (`{ error }`), so text bodies lost the
 * message entirely.
 */
export const onError: ErrorHandler = (err, c) => {
  if (err instanceof HTTPException) {
    // An exception built with its own Response (`{ res }`) keeps it.
    if (err.res) return err.getResponse();
    return c.json({ error: err.message }, err.status);
  }

  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
};

// The request logger prints only method, path and status, so a 400 in the
// Render logs says nothing about *why* it was rejected. The bodies of our 400s
// are small, machine-readable verdicts (an error code, a zod issue list, the
// refused tickers) with no credentials in them, so log them — truncated.
const MAX_LOGGED_BODY = 1000;

/** Logs the body of every non-auth 400, after the response is final. */
export async function logBadRequests(c: Context, next: Next) {
  await next();

  // Auth is left out: its 400s concern accounts (emails, sign-in attempts),
  // which do not belong in logs.
  if (c.res.status !== 400 || c.req.path.startsWith("/api/auth")) return;

  try {
    const body = await c.res.clone().text();
    console.warn(`[400] ${c.req.method} ${c.req.path} ${body.slice(0, MAX_LOGGED_BODY)}`);
  } catch {
    // A body we cannot read is not worth failing the response over.
  }
}
