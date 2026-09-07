// The one place `organization_settings` is read.
//
// Phase 3 turns that table's columns into behaviour, one control at a time. Each
// gets a typed accessor here so the rules for reading a column — what NULL means,
// how a JSON column is parsed, what a corrupt value does — live next to the
// column instead of in whichever handler happened to need it first.
//
// Rows are cached in process for a few seconds. The ticker search runs on every
// keystroke (`AssetAllocationForm.tsx` debounces to 300ms), so without a cache a
// settings row that changes at most once per admin visit costs a query per
// keypress. The TTL is short enough that nothing needs invalidating to stay
// correct; `invalidateTenantSettings` exists so a write path can make an admin's
// own change visible immediately.

import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { organizationSettings, type OrganizationSettings } from "../db/schema.js";

const CACHE_TTL_MS = 10_000;

type CacheEntry = { settings: OrganizationSettings | null; expiresAt: number };

const cache = new Map<string, CacheEntry>();

/**
 * The settings row for an organization, or `null` when it has none.
 *
 * A missing row is possible — nothing in the schema forces one — so every
 * accessor below has to answer for that case rather than assuming a row.
 */
export async function getTenantSettings(
  organizationId: string
): Promise<OrganizationSettings | null> {
  const cached = cache.get(organizationId);
  if (cached && cached.expiresAt > Date.now()) return cached.settings;

  const row = await db.query.organizationSettings.findFirst({
    where: eq(organizationSettings.organizationId, organizationId),
  });

  const settings = row ?? null;
  cache.set(organizationId, { settings, expiresAt: Date.now() + CACHE_TTL_MS });
  return settings;
}

/** Drops the cached row for one organization, or all of them when called bare. */
export function invalidateTenantSettings(organizationId?: string): void {
  if (organizationId) {
    cache.delete(organizationId);
    return;
  }
  cache.clear();
}

/**
 * The tenant's fund allowlist, upper-cased for matching.
 *
 * `null` means unrestricted, which is what NULL, an empty string and `[]` in the
 * column all mean. A **non-empty** set restricts search to those tickers.
 *
 * An empty set is the deny-everything state, reached only when the column holds
 * something we cannot read as a list of tickers. A corrupt restriction must not
 * silently become "no restriction": this is a compliance control, and search
 * returning nothing is a failure an operator notices, where quietly serving the
 * whole of Yahoo is not.
 */
export async function getFundAllowlist(organizationId: string): Promise<Set<string> | null> {
  const settings = await getTenantSettings(organizationId);
  return parseFundAllowlist(settings?.fundAllowlist ?? null, organizationId);
}

/** `true` for every ticker when `allowlist` is null — see `getFundAllowlist`. */
export function isTickerAllowed(allowlist: Set<string> | null, symbol: string): boolean {
  if (!allowlist) return true;
  return allowlist.has(symbol.trim().toUpperCase());
}

function parseFundAllowlist(raw: string | null, organizationId: string): Set<string> | null {
  if (!raw || !raw.trim()) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error(
      `[tenant-settings] organization ${organizationId} has an unparseable fund_allowlist; denying every ticker`
    );
    return new Set();
  }

  if (!Array.isArray(parsed)) {
    console.error(
      `[tenant-settings] organization ${organizationId} has a non-array fund_allowlist; denying every ticker`
    );
    return new Set();
  }

  // `[]` is the documented "unrestricted" value, same as NULL.
  if (parsed.length === 0) return null;

  const tickers = parsed
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim().toUpperCase())
    .filter((entry) => entry.length > 0);

  if (tickers.length === 0) {
    console.error(
      `[tenant-settings] organization ${organizationId} has a fund_allowlist with no usable tickers; denying every ticker`
    );
    return new Set();
  }

  return new Set(tickers);
}
