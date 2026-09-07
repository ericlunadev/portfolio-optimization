/**
 * Tenant identity, resolved from the `Host` header on the server (PLAN Tasks
 * 1.1, 1.3 and 1.4).
 *
 * **Why this exists at all.** `lib/api.ts` is browser-only in both branches — an
 * absolute URL with `credentials: include` when `NEXT_PUBLIC_API_URL` is set,
 * a relative `/api` otherwise — and a relative fetch from a server component
 * has no base URL to resolve against. `next.config.js`'s `rewrites()` do not
 * apply to server-side fetches either. So the server needs its own client, and
 * this is it: one unauthenticated GET, called from the middleware and from the
 * root layout.
 *
 * **Brand values are tenant data, not translated copy.** `Brand` and `Metadata`
 * used to live in `messages/{es,en}.json`, which are static and identical for
 * every tenant. They are runtime configuration now. See the note in CLAUDE.md.
 *
 * Deliberately free of `next/headers` and `next/server`: the Edge middleware and
 * the Node root layout both import it, and so does a plain unit test.
 */

/** The organization the host resolved to. Attached to the request by the middleware. */
export const ORG_ID_HEADER = "x-org-id";
/** Its slug — an internal identifier (PLAN §3.1), carried for logging and debugging. */
export const ORG_SLUG_HEADER = "x-org-slug";
/** The normalized host the middleware resolved from, so downstream readers agree on one value. */
export const TENANT_HOST_HEADER = "x-tenant-host";

/** D14: only `cobranded` renders "Powered by". */
export type TenantTier = "cobranded" | "whitelabel";

export interface TenantBrand {
  /** First, gradient half of the wordmark. Empty when a tenant has no short name. */
  shortName: string;
  /** Second half of the wordmark. */
  fullName: string;
  tagline: string;
  /** `<title>`. */
  title: string;
  /** `<meta name="description">`. */
  description: string;
}

export interface TenantConfig {
  /** `null` only when the lookup failed and we fell back to our own brand. */
  organizationId: string | null;
  slug: string | null;
  tier: TenantTier;
  brand: TenantBrand;
  /** The single colour input a tenant gets (D9). `null` keeps the stock palette. */
  accentHex: string | null;
  fontKey: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
}

/**
 * Our own brand, and the floor every tenant field falls back to.
 *
 * These are the strings that used to be `Brand` and `Metadata` in the Spanish
 * message file. They are not localized any more and should not be: a tenant
 * configures one product name, not one per locale, and D5 makes the D2C product
 * tenant #1 — so its brand is a tenant's brand like any other.
 */
export const DEFAULT_TENANT_CONFIG: TenantConfig = {
  organizationId: null,
  slug: null,
  tier: "cobranded",
  brand: {
    shortName: "Optim.",
    fullName: "Portafolio",
    tagline: "Optimización de portafolio basada en la teoría de Markowitz",
    title: "Optimización de Portafolio",
    description: "Herramienta de optimización de portafolio Markowitz",
  },
  accentHex: null,
  fontKey: null,
  logoUrl: null,
  faviconUrl: null,
};

/**
 * The canonical form of a `Host` header: lower-cased, without the port and
 * without the root label's trailing dot. Mirrors `normalizeHostname` in
 * `apps/api/src/modules/organizations/branding-by-host.ts`.
 */
export function normalizeHostname(raw: string | null | undefined): string | null {
  if (!raw) return null;

  // `x-forwarded-host` can carry a proxy chain; the first entry is the client's.
  let host = raw.split(",")[0].trim().toLowerCase();

  // `[::1]:3000` — an IPv6 literal keeps its brackets, so the port is whatever
  // follows the last one. Anything else splits on the first colon.
  const portAt = host.startsWith("[") ? host.indexOf(":", host.lastIndexOf("]")) : host.indexOf(":");
  if (portAt !== -1) host = host.slice(0, portAt);

  if (host.endsWith(".")) host = host.slice(0, -1);

  return host || null;
}

// Same precedence as the `rewrites()` block in next.config.js and the ticker
// search proxy, plus the public variable for a deployment that only sets that.
function apiBaseUrl(): string {
  return process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";
}

function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Maps `GET /api/tenants/by-host` onto a config, falling back field by field.
 *
 * Field by field rather than row by row: a tenant who has set only an accent
 * colour should get their accent over our wordmark, not our accent because part
 * of their branding row is still empty.
 */
export function tenantConfigFromResponse(payload: unknown): TenantConfig {
  if (!payload || typeof payload !== "object") return DEFAULT_TENANT_CONFIG;

  const body = payload as Record<string, unknown>;
  const organizationId = readString(body, "organizationId");
  if (!organizationId) return DEFAULT_TENANT_CONFIG;

  const branding =
    body.branding && typeof body.branding === "object"
      ? (body.branding as Record<string, unknown>)
      : {};

  const fallback = DEFAULT_TENANT_CONFIG.brand;
  const productName = readString(branding, "productName");
  const productShortName = readString(branding, "productShortName");
  const tagline = readString(branding, "tagline");

  // A tenant sets one product name, so it becomes the whole wordmark and the
  // short half goes empty — our "Optim. Portafolio" split is ours, not a shape
  // every brand has.
  const brand: TenantBrand = productName
    ? {
        shortName: productShortName ?? "",
        fullName: productName,
        tagline: tagline ?? "",
        title: productName,
        description: tagline ?? productName,
      }
    : {
        ...fallback,
        shortName: productShortName ?? fallback.shortName,
        tagline: tagline ?? fallback.tagline,
        description: tagline ?? fallback.description,
      };

  return {
    organizationId,
    slug: readString(body, "slug"),
    tier: body.tier === "whitelabel" ? "whitelabel" : "cobranded",
    brand,
    accentHex: readString(branding, "accentHex"),
    fontKey: readString(branding, "fontKey"),
    logoUrl: readString(branding, "logoUrl"),
    faviconUrl: readString(branding, "faviconUrl"),
  };
}

/**
 * How long a resolved host stays cached in this process.
 *
 * Short on purpose. Branding is self-serve (D13), so an owner who changes their
 * accent wants to see it without a redeploy; and the whole point of the cache is
 * to keep the middleware from making one API call per asset request, which a
 * minute already achieves. PLAN Task 1.8 owns the wider caching audit.
 */
export const TENANT_CONFIG_TTL_MS = 60_000;

type CacheEntry = { config: TenantConfig; expiresAt: number };

// Per-process, and there are two processes: the Edge middleware and the Node
// server render each keep their own. That is fine — they resolve to the same
// answer, and neither is a correctness dependency of the other.
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<TenantConfig>>();

/** For tests, and for anything that needs a cold read. */
export function clearTenantConfigCache(): void {
  cache.clear();
  inFlight.clear();
}

async function requestTenantConfig(hostname: string): Promise<TenantConfig> {
  const url = `${apiBaseUrl()}/api/tenants/by-host?host=${encodeURIComponent(hostname)}`;

  try {
    // `no-store` because this module does its own TTL caching: leaving it to
    // Next's Data Cache would key on the URL across every tenant's render and
    // is exactly the cache-bleed Phase 1 has to rule out.
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      console.error(`Tenant lookup for ${hostname} responded ${response.status}`);
      return DEFAULT_TENANT_CONFIG;
    }

    return tenantConfigFromResponse(await response.json());
  } catch (error) {
    // A misconfigured host degrades to our brand; so does an unreachable API.
    // Neither is worth an error page.
    console.error(`Tenant lookup for ${hostname} failed:`, error);
    return DEFAULT_TENANT_CONFIG;
  }
}

/**
 * The tenant for a `Host` header. Never rejects: an unknown host, an unreachable
 * API and a malformed answer all resolve to our own brand.
 */
export async function fetchTenantConfig(host: string | null | undefined): Promise<TenantConfig> {
  const hostname = normalizeHostname(host);
  if (!hostname) return DEFAULT_TENANT_CONFIG;

  const cached = cache.get(hostname);
  if (cached && cached.expiresAt > Date.now()) return cached.config;

  // A cold cache under load would otherwise fire one lookup per concurrent
  // request for the same host.
  const pending = inFlight.get(hostname);
  if (pending) return pending;

  const request = requestTenantConfig(hostname)
    .then((config) => {
      cache.set(hostname, { config, expiresAt: Date.now() + TENANT_CONFIG_TTL_MS });
      return config;
    })
    .finally(() => {
      inFlight.delete(hostname);
    });

  inFlight.set(hostname, request);
  return request;
}

/**
 * The inline `<style>` that overrides the accent tokens before first paint.
 *
 * Same trick `THEME_INIT_SCRIPT` plays for dark mode: decide on the server, emit
 * it in `<head>`, and there is no flash of our brand to correct afterwards.
 * `:root` carries the light appearance and `.dark` overrides it, matching how
 * `globals.css` is organised — the selectors have to be those two, or the
 * cascade puts the tenant's colour behind ours.
 */
export function tenantPaletteCss(
  light: Record<string, string>,
  dark: Record<string, string>
): string {
  const root = declarations(light);
  const darkRoot = declarations(dark);

  return [root && `:root{${root}}`, darkRoot && `.dark{${darkRoot}}`].filter(Boolean).join("");
}

/** A CSS custom-property name: two dashes, then letters, digits and dashes. */
const TOKEN_PATTERN = /^--[a-z0-9-]+$/;

/**
 * Colour values only — HSL channels, a hex, a slash for alpha. The accent
 * originates in a database column a tenant owner types into, so it reaches this
 * function as untrusted text; `<`, `{`, `}`, `;` and `"` are what would let it
 * close the style element or add a declaration of its own.
 */
const VALUE_PATTERN = /^[a-z0-9%#.,/()\s-]+$/i;

function declarations(tokens: Record<string, string>): string {
  return Object.entries(tokens)
    .filter(([token, value]) => TOKEN_PATTERN.test(token) && VALUE_PATTERN.test(value))
    .map(([token, value]) => `${token}:${value.trim()};`)
    .join("");
}
