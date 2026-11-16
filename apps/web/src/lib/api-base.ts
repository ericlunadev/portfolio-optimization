/**
 * Where the browser sends API requests: always its own host.
 *
 * `/api/*` is proxied to the API by the `rewrites()` block in next.config.js
 * (`API_URL` on the server). The browser never calls the API host directly, and
 * that is what keeps **sessions per tenant**: BetterAuth's session cookie is
 * host-only, so a session made on `brio.prontofolio.com` lives on that host and
 * one made on `prontofolio.com` on that one.
 *
 * It used to be configurable: with `NEXT_PUBLIC_API_URL` set the browser called
 * the API's own domain cross-origin, and the cookie lived there instead — one
 * session for every tenant, since `SameSite=None; Partitioned` partitions by
 * site and all tenant hosts are the same site. Signing in on one tenant signed
 * you in on all of them, in the other tenant's colours. Do not bring the knob
 * back for browser code; server-side callers use `API_URL` directly.
 */
export const API_BASE = "/api";

/** Same-origin: the session cookie belongs to this host. */
export const API_CREDENTIALS: RequestCredentials = "same-origin";
