// Which tenant a transactional auth email belongs to: the origin its links are
// built on, and the product name it carries (PLAN Task 1.0).
//
// The tenant is the host the request came from, read from `Origin`, else
// `Referer` — the same two headers, in the same order, that BetterAuth's origin
// check compares and `trustedOrigins` in lib/auth.ts reads — and accepted only
// when `resolveTenantOrigin` maps it to a registered `organization_domain` row.
//
// **This is a link in an email carrying a secret, so the input is hostile.**
// Password-reset poisoning works by getting the server to build the link from a
// header the attacker controls: they request a reset for the victim with a forged
// host, and the victim's own inbox receives a genuine token pointing at the
// attacker's site. So:
//
//   - `Host`, `X-Forwarded-Host` and the request URL are never read. On the Node
//     server the request URL is itself built from `Host`.
//   - `Origin` and `Referer` are forgeable too — BetterAuth does not even check
//     the origin of a reset request that carries no cookie — so neither becomes a
//     link base on its own. Only an origin `resolveTenantOrigin` returns does: the
//     exact registered hostname, under its scheme and port rule. A lookalike or
//     unknown host falls through to `FRONTEND_URL`.
//   - What a forged header can still do is pick *which* registered tenant's
//     host and name a victim's email shows. Every such host is ours and serves
//     the same API, so the token never leaves our infrastructure.
//
// No request (a direct `auth.api` call) and a non-web origin (the Expo app's
// deep-link scheme) resolve nothing, and get `FRONTEND_URL` as before.

import { eq } from "drizzle-orm";
import { env } from "../../config/env.js";
import { db } from "../../db/index.js";
import { organization, organizationBranding, organizationDomain } from "../../db/schema.js";
import { resolveTenantOrigin } from "../trusted-origins.js";

export interface EmailTenant {
  /** The origin every link in the email is built on. */
  baseUrl: string;
  /**
   * The tenant's product name, or `null` when its branding row has none — the
   * template then uses its own localized fallback.
   */
  productName: string | null;
}

async function productNameForHostname(hostname: string): Promise<{ productName: string | null } | null> {
  const [row] = await db
    .select({ productName: organizationBranding.productName })
    .from(organizationDomain)
    .leftJoin(
      organizationBranding,
      eq(organizationBranding.organizationId, organizationDomain.organizationId)
    )
    .where(eq(organizationDomain.hostname, hostname))
    .limit(1);
  return row ?? null;
}

// `FRONTEND_URL` is the default tenant's site, so an email linking there carries
// the default tenant's name — the same organization `GET /api/tenants/by-host`
// serves for a host it does not know.
async function defaultProductName(): Promise<string | null> {
  const [row] = await db
    .select({ productName: organizationBranding.productName })
    .from(organization)
    .leftJoin(organizationBranding, eq(organizationBranding.organizationId, organization.id))
    .where(eq(organization.isDefault, true))
    .limit(1);
  return row?.productName ?? null;
}

export async function resolveEmailTenant(request?: Request): Promise<EmailTenant> {
  const claimed = request?.headers.get("origin") || request?.headers.get("referer");
  const origin = claimed ? await resolveTenantOrigin(claimed) : null;

  if (origin) {
    // `resolveTenantOrigin` answers from a cache a few seconds old, so the row is
    // read again rather than assumed: a hostname removed in that window gets the
    // fallback, not a link to a host that no longer belongs to anyone.
    const tenant = await productNameForHostname(new URL(origin).hostname);
    if (tenant) return { baseUrl: origin, productName: tenant.productName };
  }

  return { baseUrl: env.FRONTEND_URL, productName: await defaultProductName() };
}
