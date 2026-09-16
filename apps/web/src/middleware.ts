import { NextResponse, type NextRequest } from "next/server";
import {
  fetchTenantConfig,
  normalizeHostname,
  ORG_ID_HEADER,
  ORG_SLUG_HEADER,
  TENANT_HOST_HEADER,
} from "@/lib/tenant-config";

// Host-based tenant resolution (PLAN Task 1.1).
//
// Every request enters here, the `Host` header is turned into an organization,
// and the answer is attached to the request so the root layout and any server
// component below it can read it without repeating the lookup.
//
// **An unknown host serves the default (D2C) tenant, never a 404.** A DNS record
// pointed here before its `organization_domain` row exists — or a typo in one —
// should degrade to our brand, not to an error page in front of a customer.
// `fetchTenantConfig` extends the same rule to an unreachable API.
//
// **Branding follows the host; data follows the membership row** (PLAN §3.1).
// Nothing here authenticates, authorises or redirects: a signed-in user loading
// another tenant's hostname sees that host's brand around their own org's data,
// which is cosmetic and permitted. A mismatch check would lock out every D2C
// user whose personal organization has no domain row.

export async function middleware(request: NextRequest) {
  const host = normalizeHostname(
    request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  );
  const tenant = await fetchTenantConfig(host);

  const headers = new Headers(request.headers);

  // Drop anything the client sent under these names before writing ours. The
  // API never takes tenancy from a header (`middleware/auth.ts` resolves it
  // from the membership row) and neither should a server component, but a
  // forged value must not be readable at all.
  headers.delete(ORG_ID_HEADER);
  headers.delete(ORG_SLUG_HEADER);
  headers.delete(TENANT_HOST_HEADER);

  if (host) headers.set(TENANT_HOST_HEADER, host);
  if (tenant.organizationId) headers.set(ORG_ID_HEADER, tenant.organizationId);
  if (tenant.slug) headers.set(ORG_SLUG_HEADER, tenant.slug);

  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Everything a person can see, and nothing a build step emits. `_next/static`
  // and `_next/image` are already-resolved assets, and the file extensions cover
  // `public/` — none of them render brand, so none of them need a lookup.
  matcher: ["/((?!_next/static|_next/image|.*\\.[^/]+$).*)"],
};
