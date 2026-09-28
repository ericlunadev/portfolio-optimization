import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { organization, organizationBranding, organizationDomain } from "../../db/schema.js";

// Public tenant lookup: the one channel `apps/web` has for turning a `Host`
// header into an organization (PLAN Task 1.1).
//
// It has to be unauthenticated. The web middleware and the root layout run
// before anything knows who the visitor is — a signed-out person loading a
// tenant's login page must still get that tenant's brand — so there is no
// session to read. Everything else about the endpoint is shaped by that.
//
// **It is a public surface, so it must not enumerate the client list.** The
// mitigations, all of them load-bearing:
//
//   - **Exact hostname match only.** `eq(hostname, ...)` on a normalized value.
//     No `like`, no prefix or suffix matching, no wildcard, no "did you mean".
//     `acme.optim.app.attacker.test` and `acme` both miss.
//   - **No listing.** There is one route and it requires a host. Nothing here
//     returns more than one organization, and there is no cursor, no `?all=`,
//     no empty-query-means-everything.
//   - **A miss is not distinguishable by status.** An unknown host answers 200
//     with the default (D2C) tenant, exactly as a misconfigured DNS record
//     should degrade — to our brand, not to an error page (PLAN Task 1.1).
//   - **A narrow payload.** Only the fields the page needs before first paint.
//     `support_email`, the privacy/terms URLs and the disclaimer stay behind
//     the authenticated `GET /api/organizations/branding`, which a member reads
//     for their own tenant.
//
// What is left is intrinsic and cannot be designed away: someone who already
// guesses a tenant's hostname learns that it is a tenant. So does opening it in
// a browser. The list itself stays unreachable.
//
// MOUNTED OUTSIDE `/api/organizations` ON PURPOSE. `modules/organizations/routes.ts`
// registers `app.use("*", authMiddleware)`, and Hono re-registers a sub-app's
// middleware onto the parent at the mounted prefix — so *any* route under
// `/api/organizations/*` inherits that 401, whichever sub-app declares it.
// PLAN Task 1.1 names this endpoint `GET /api/tenants/by-host`; `app.ts` mounts
// this router at `/api/tenants`.

const app = new Hono();

/** Longest legal DNS name. Anything longer cannot be a host we serve. */
const MAX_HOSTNAME_LENGTH = 253;

/** Hostname characters. Deliberately excludes `%` and `_`, which are LIKE wildcards. */
const HOSTNAME_PATTERN = /^[a-z0-9.-]+$/;

/**
 * The canonical form of a `Host` header: lower-cased, without the port and
 * without the root label's trailing dot.
 *
 * `apps/web/src/lib/tenant-config.ts` normalizes the same way before calling.
 * Both sides do it so neither has to trust the other to have done it.
 */
export function normalizeHostname(raw: string): string {
  let host = raw.trim().toLowerCase();

  // `[::1]:3000` — an IPv6 literal keeps its brackets, so the port is whatever
  // follows the last one. Anything else splits on the first colon.
  const portAt = host.startsWith("[") ? host.indexOf(":", host.lastIndexOf("]")) : host.indexOf(":");
  if (portAt !== -1) host = host.slice(0, portAt);

  if (host.endsWith(".")) host = host.slice(0, -1);

  return host;
}

function isLookupCandidate(host: string): boolean {
  return host.length > 0 && host.length <= MAX_HOSTNAME_LENGTH && HOSTNAME_PATTERN.test(host);
}

// GET /api/tenants/by-host?host=acme.optim.app
app.get("/by-host", async (c) => {
  const requested = c.req.query("host");

  // A caller that forgot the parameter has a bug; answering with the default
  // tenant would hide it. An unknown *host* is the case that degrades quietly.
  if (!requested) {
    return c.json({ error: "Query parameter 'host' is required" }, 400);
  }

  const hostname = normalizeHostname(requested);

  // A syntactically impossible host cannot match a row, so skip the query
  // rather than let it decide. Answering the same way a miss does keeps the
  // endpoint from doubling as a "is this string a valid hostname" oracle.
  const domain = isLookupCandidate(hostname)
    ? await db.query.organizationDomain.findFirst({
        where: eq(organizationDomain.hostname, hostname),
        columns: { organizationId: true },
      })
    : undefined;

  const org = domain
    ? await db.query.organization.findFirst({ where: eq(organization.id, domain.organizationId) })
    : await db.query.organization.findFirst({ where: eq(organization.isDefault, true) });

  if (!org) {
    // No default tenant means the database has never been seeded
    // (`pnpm seed:dev-org`). The web client falls back to its built-in brand.
    return c.json({ error: "No tenant configured" }, 404);
  }

  const branding = await db.query.organizationBranding.findFirst({
    where: eq(organizationBranding.organizationId, org.id),
  });

  // Never cached at the edge: one URL per host is easy to get wrong, and a
  // tenant served another tenant's brand is the worst failure this endpoint
  // has. The web client keeps a short in-process cache instead (PLAN Task 1.8
  // revisits this once the caching audit has a baseline).
  c.header("Cache-Control", "no-store");

  return c.json({
    organizationId: org.id,
    // The slug is an internal identifier (PLAN §3.1) but the web middleware
    // attaches it as `x-org-slug`, so it has to travel.
    slug: org.slug,
    tier: org.tier,
    isDefault: org.isDefault,
    branding: {
      productName: branding?.productName ?? null,
      productShortName: branding?.productShortName ?? null,
      tagline: branding?.tagline ?? null,
      accentHex: branding?.accentHex ?? null,
      fontKey: branding?.fontKey ?? null,
      logoUrl: branding?.logoUrl ?? null,
      faviconUrl: branding?.faviconUrl ?? null,
    },
  });
});

export default app;
