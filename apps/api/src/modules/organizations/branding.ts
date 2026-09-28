import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  organization,
  organizationBranding,
  organizationMember,
} from "../../db/schema.js";
import { authMiddleware } from "../../middleware/auth.js";

// PLAN Task 1.7 — the tenant's self-serve branding settings (D13).
//
// NOT MOUNTED YET: `app.ts` needs `app.route("/api/organizations", branding)`
// alongside the two org routers it already composes. Until that line lands these
// routes answer 404 and the settings page cannot load.
//
// Two routes, both owner-only, sitting beside the member-readable
// `GET /branding` in `routes.ts`:
//
//   GET  /branding/settings   what the form loads
//   PUT  /branding            what the form saves
//
// The organization is always the caller's own, resolved from the membership row
// by `authMiddleware`. There is deliberately no `:organizationId` parameter: an
// owner can only ever edit their own tenant, so accepting one would add an
// authorisation decision that does not need to exist.
//
// `logoUrl` and `faviconUrl` are readable but NOT writable here. PLAN Task 1.5
// leaves asset storage unresolved — there is no blob storage in this stack — and
// the interim answer it offers (commit files under `apps/web/public/tenants/`)
// contradicts self-serve branding, so the form does not pretend to offer it.

const app = new Hono();

app.use("*", authMiddleware);

/** D11: a fixed menu, because `next/font/google` needs statically-analysable literals. */
export const FONT_KEYS = [
  "instrument-sans",
  "inter",
  "manrope",
  "source-serif",
  "ibm-plex-sans",
  "space-grotesk",
] as const;

export type FontKey = (typeof FONT_KEYS)[number];

/** Field limits. Generous enough to be invisible in normal use, small enough to keep a layout intact. */
const MAX_LENGTHS = {
  productName: 60,
  productShortName: 24,
  tagline: 120,
  supportEmail: 254,
  privacyPolicyUrl: 500,
  termsUrl: 500,
  disclaimerText: 600,
} as const;

export interface BrandingUpdate {
  productName: string | null;
  productShortName: string | null;
  tagline: string | null;
  accentHex: string | null;
  fontKey: string | null;
  supportEmail: string | null;
  privacyPolicyUrl: string | null;
  termsUrl: string | null;
  disclaimerText: string | null;
}

export type FieldErrors = Partial<Record<keyof BrandingUpdate, string>>;

const TEXT_FIELDS = [
  "productName",
  "productShortName",
  "tagline",
  "disclaimerText",
] as const;

/**
 * Normalises `#abc` / `#AABBCC` to `#aabbcc`, or returns null when it is not a
 * hex colour at all. Shorthand is expanded rather than rejected: a colour picker
 * elsewhere may well hand us three digits, and refusing them would read as a bug.
 */
export function normalizeAccentHex(input: string): string | null {
  const value = input.trim().toLowerCase();
  const short = /^#?([0-9a-f]{3})$/.exec(value);
  if (short) {
    const [r, g, b] = short[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  const full = /^#?([0-9a-f]{6})$/.exec(value);
  return full ? `#${full[1]}` : null;
}

/** Deliberately shallow: the address is displayed, never delivered to from here. */
function isEmailShaped(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Reads one field off an untyped body. A missing key means "leave it alone", an
 * empty string means "clear it" — the two are different intents and a settings
 * form sends both.
 */
function readField(body: Record<string, unknown>, key: string): string | null | undefined {
  if (!(key in body)) return undefined;
  const raw = body[key];
  if (raw === null) return null;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Validates a settings-form body into the columns to write, or the per-field
 * messages to show. Exported so the shape is testable without a request.
 */
export function parseBrandingUpdate(
  body: Record<string, unknown>
): { values: Partial<BrandingUpdate> } | { errors: FieldErrors } {
  const values: Partial<BrandingUpdate> = {};
  const errors: FieldErrors = {};

  for (const key of TEXT_FIELDS) {
    const value = readField(body, key);
    if (value === undefined) continue;
    if (value !== null && value.length > MAX_LENGTHS[key]) {
      errors[key] = `Must be at most ${MAX_LENGTHS[key]} characters`;
      continue;
    }
    values[key] = value;
  }

  const accent = readField(body, "accentHex");
  if (accent !== undefined) {
    if (accent === null) {
      // Clearing the accent is allowed: the tenant falls back to our own gold.
      values.accentHex = null;
    } else {
      const normalized = normalizeAccentHex(accent);
      if (!normalized) {
        errors.accentHex = "Must be a hex colour such as #2f6f4f";
      } else {
        values.accentHex = normalized;
      }
    }
  }

  const fontKey = readField(body, "fontKey");
  if (fontKey !== undefined) {
    if (fontKey === null) {
      values.fontKey = null;
    } else if (!(FONT_KEYS as readonly string[]).includes(fontKey)) {
      errors.fontKey = `Must be one of: ${FONT_KEYS.join(", ")}`;
    } else {
      values.fontKey = fontKey;
    }
  }

  const supportEmail = readField(body, "supportEmail");
  if (supportEmail !== undefined) {
    if (supportEmail !== null && supportEmail.length > MAX_LENGTHS.supportEmail) {
      errors.supportEmail = `Must be at most ${MAX_LENGTHS.supportEmail} characters`;
    } else if (supportEmail !== null && !isEmailShaped(supportEmail)) {
      errors.supportEmail = "Must be an email address";
    } else {
      values.supportEmail = supportEmail;
    }
  }

  for (const key of ["privacyPolicyUrl", "termsUrl"] as const) {
    const value = readField(body, key);
    if (value === undefined) continue;
    if (value !== null && value.length > MAX_LENGTHS[key]) {
      errors[key] = `Must be at most ${MAX_LENGTHS[key]} characters`;
    } else if (value !== null && !isHttpUrl(value)) {
      errors[key] = "Must be an http(s) URL";
    } else {
      values[key] = value;
    }
  }

  return Object.keys(errors).length > 0 ? { errors } : { values };
}

/** `owner` is the only role that may read or write the tenant's brand (PLAN Task 1.7). */
async function isOwner(organizationId: string, userId: string): Promise<boolean> {
  const membership = await db.query.organizationMember.findFirst({
    where: and(
      eq(organizationMember.organizationId, organizationId),
      eq(organizationMember.userId, userId)
    ),
    columns: { role: true },
  });

  return membership?.role === "owner";
}

async function readBranding(organizationId: string) {
  const [row, org] = await Promise.all([
    db.query.organizationBranding.findFirst({
      where: eq(organizationBranding.organizationId, organizationId),
    }),
    db.query.organization.findFirst({
      where: eq(organization.id, organizationId),
      columns: { name: true, tier: true },
    }),
  ]);

  return {
    organizationId,
    organizationName: org?.name ?? null,
    // The commercial tier is read-only here on purpose: an owner who could flip
    // it would drop the "Powered by" line they are paying us to carry (D14).
    tier: org?.tier ?? null,
    productName: row?.productName ?? null,
    productShortName: row?.productShortName ?? null,
    tagline: row?.tagline ?? null,
    accentHex: row?.accentHex ?? null,
    fontKey: row?.fontKey ?? null,
    logoUrl: row?.logoUrl ?? null,
    faviconUrl: row?.faviconUrl ?? null,
    supportEmail: row?.supportEmail ?? null,
    privacyPolicyUrl: row?.privacyPolicyUrl ?? null,
    termsUrl: row?.termsUrl ?? null,
    disclaimerText: row?.disclaimerText ?? null,
    fontKeys: FONT_KEYS,
  };
}

// GET /api/organizations/branding/settings - the branding form's own read
//
// Separate from the member-readable `GET /branding` because it carries the tier
// and the font menu, and because a member landing on the settings page should
// get the 403 that tells the page to render its "owners only" notice rather than
// a form whose save would fail.
app.get("/branding/settings", async (c) => {
  const organizationId = c.get("organizationId");
  const currentUser = c.get("user");

  if (!(await isOwner(organizationId, currentUser.id))) {
    return c.json({ error: "Only an organization owner can edit branding" }, 403);
  }

  return c.json(await readBranding(organizationId));
});

// PUT /api/organizations/branding - save the branding form
app.put("/branding", async (c) => {
  const organizationId = c.get("organizationId");
  const currentUser = c.get("user");

  if (!(await isOwner(organizationId, currentUser.id))) {
    return c.json({ error: "Only an organization owner can edit branding" }, 403);
  }

  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return c.json({ error: "Expected a JSON object" }, 400);
  }

  const parsed = parseBrandingUpdate(body as Record<string, unknown>);
  if ("errors" in parsed) {
    return c.json({ error: "Invalid branding", fields: parsed.errors }, 400);
  }

  // A body naming no known field is a no-op, not an error — and an empty `set`
  // is not valid SQL, so it must not reach the upsert.
  if (Object.keys(parsed.values).length > 0) {
    // A tenant provisioned before the branding row existed, or a personal org
    // from the backfill, has no row to update — so upsert rather than assume one.
    await db
      .insert(organizationBranding)
      .values({ organizationId, ...parsed.values, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: organizationBranding.organizationId,
        set: { ...parsed.values, updatedAt: new Date() },
      });
  }

  return c.json(await readBranding(organizationId));
});

export default app;
