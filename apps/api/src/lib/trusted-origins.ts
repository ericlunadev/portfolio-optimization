// The browser origins the API trusts beyond the static FRONTEND_URL: the tenant
// hostnames registered in `organization_domain`.
//
// Two gates read this, through the same function, so they cannot disagree about
// a tenant: BetterAuth's CSRF origin check (`trustedOrigins` in lib/auth.ts) and
// the CORS allowlist (app.ts). Tenants are created at runtime by
// `provision:tenant`, so this is data rather than config — a static list would
// make every new tenant an env change plus a redeploy (PLAN §3.2).
//
// It is CSRF protection, so the rule is deliberately narrow:
//
//   - **The exact registered hostname.** The value is parsed with `URL` and its
//     `hostname` must equal a row. No wildcard, suffix or substring matching:
//     `acme.localhost.evil.test`, `evil-acme.localhost` and `acme.localhost.`
//     are simply not rows.
//   - **https in production, unless the host is loopback.** A page served over
//     plain http can be rewritten by anyone on the network path, and a script
//     injected there would carry the tenant's origin. `localhost` and
//     `*.localhost` are exempt because browsers resolve them to the loopback
//     interface and already treat them as secure contexts. Outside production
//     (an http BACKEND_URL, i.e. local development) http is allowed.
//   - **The default port in production, unless the host is loopback.** Tenants
//     are served on 443 only, so another port on a tenant's name is some other
//     service and trusting it buys nothing. Locally, dev servers move ports.
//
// The loopback test below only relaxes the scheme and port; it never makes a
// hostname trusted on its own. That still takes a row.
//
// The registry is cached in process for a few seconds: a sign-in page fires
// several auth calls, and BetterAuth consults `trustedOrigins` more than once
// per call. A newly provisioned tenant starts working within the TTL, with no
// restart. The cache holds the whole hostname set rather than per-origin
// answers, so an unregistered origin costs a Set lookup — cycling random Origin
// headers can neither grow the cache nor reach the database.

import { isProduction } from "../config/env.js";
import { db } from "../db/index.js";
import { organizationDomain } from "../db/schema.js";

export const TENANT_HOSTNAMES_TTL_MS = 10_000;

let cached: { hostnames: ReadonlySet<string>; expiresAt: number } | null = null;
let pending: Promise<ReadonlySet<string>> | null = null;

async function loadTenantHostnames(): Promise<ReadonlySet<string>> {
  const rows = await db.select({ hostname: organizationDomain.hostname }).from(organizationDomain);
  const hostnames = new Set(rows.map((row) => row.hostname));
  cached = { hostnames, expiresAt: Date.now() + TENANT_HOSTNAMES_TTL_MS };
  return hostnames;
}

async function getTenantHostnames(): Promise<ReadonlySet<string>> {
  if (cached && cached.expiresAt > Date.now()) return cached.hostnames;

  // Concurrent callers share one query. A failed read is not cached: the error
  // propagates (the request fails closed) and the next caller retries.
  pending ??= loadTenantHostnames().finally(() => {
    pending = null;
  });
  return pending;
}

/** Drops the cached registry, so a write path can make a new hostname trusted immediately. */
export function invalidateTenantOrigins(): void {
  cached = null;
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname.endsWith(".localhost");
}

/**
 * The serialized origin of `url` when it belongs to a registered tenant under
 * the scheme and port rule above, or `null`.
 *
 * `url` may be a bare origin (an `Origin` header) or a full URL (a `Referer`);
 * only its origin is considered.
 */
export async function resolveTenantOrigin(url: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const local = !isProduction || isLoopbackHostname(parsed.hostname);
  const schemeAllowed = parsed.protocol === "https:" || (parsed.protocol === "http:" && local);
  // `URL` reports an empty port for the scheme's default, so `:443` passes too.
  const portAllowed = parsed.port === "" || local;
  if (!schemeAllowed || !portAllowed) return null;

  const hostnames = await getTenantHostnames();
  return hostnames.has(parsed.hostname) ? parsed.origin : null;
}
