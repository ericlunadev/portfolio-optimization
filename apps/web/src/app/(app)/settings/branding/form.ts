import {
  MIN_CONTRAST,
  THEME_BACKGROUND_HEX,
  contrastRatio,
  deriveTenantPalette,
  normalizeAccentHex,
} from "@/lib/tenant-palette";
import type { ResolvedTheme } from "@/lib/theme";

// PLAN Task 1.7 — everything the branding form decides, with no React in it.
//
// The page renders this; the API validates it again. Both are needed and for
// different reasons: the server is the authority, and the form is what tells a
// tenant *before* they save that their brand red will be darkened on a white
// page. Neither is the other's fallback.

/** What `GET /api/organizations/branding/settings` answers. */
export interface BrandingSettings {
  organizationId: string;
  organizationName: string | null;
  /** `organization.tier` — read-only here (D14). */
  tier: string | null;
  productName: string | null;
  productShortName: string | null;
  tagline: string | null;
  accentHex: string | null;
  fontKey: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  supportEmail: string | null;
  privacyPolicyUrl: string | null;
  termsUrl: string | null;
  disclaimerText: string | null;
  /** The fixed font menu (D11), as the server knows it. */
  fontKeys: string[];
}

/**
 * The editable fields, as the inputs hold them: always strings, where `""`
 * means "cleared". The API reads an empty string as a null, so the round trip
 * needs no third state for "the user emptied this box".
 */
export interface BrandingForm {
  productName: string;
  productShortName: string;
  tagline: string;
  accentHex: string;
  fontKey: string;
  supportEmail: string;
  privacyPolicyUrl: string;
  termsUrl: string;
  disclaimerText: string;
}

export type BrandingFieldKey = keyof BrandingForm;

export const BRANDING_FIELD_KEYS: BrandingFieldKey[] = [
  "productName",
  "productShortName",
  "tagline",
  "accentHex",
  "fontKey",
  "supportEmail",
  "privacyPolicyUrl",
  "termsUrl",
  "disclaimerText",
];

/** Mirrors the limits in `apps/api/src/modules/organizations/branding.ts`. */
export const MAX_LENGTHS: Partial<Record<BrandingFieldKey, number>> = {
  productName: 60,
  productShortName: 24,
  tagline: 120,
  supportEmail: 254,
  privacyPolicyUrl: 500,
  termsUrl: 500,
  disclaimerText: 600,
};

/**
 * A validation failure, as a message key plus whatever the message interpolates.
 * Keys live in the `BrandingSettings` namespace of the message files — the form
 * never carries a user-facing sentence of its own.
 */
export type BrandingFieldError =
  | { key: "accentInvalid" }
  | { key: "supportEmailInvalid" }
  | { key: "urlInvalid" }
  | { key: "tooLong"; max: number };

export type BrandingFieldErrors = Partial<
  Record<BrandingFieldKey, BrandingFieldError>
>;

export function toForm(settings: BrandingSettings): BrandingForm {
  return {
    productName: settings.productName ?? "",
    productShortName: settings.productShortName ?? "",
    tagline: settings.tagline ?? "",
    accentHex: settings.accentHex ?? "",
    fontKey: settings.fontKey ?? "",
    supportEmail: settings.supportEmail ?? "",
    privacyPolicyUrl: settings.privacyPolicyUrl ?? "",
    termsUrl: settings.termsUrl ?? "",
    disclaimerText: settings.disclaimerText ?? "",
  };
}

export function isDirty(form: BrandingForm, original: BrandingForm): boolean {
  return BRANDING_FIELD_KEYS.some(
    (key) => form[key].trim() !== original[key].trim()
  );
}

/** Trims every field; the API does the same, so the two agree on "empty". */
export function toRequestBody(form: BrandingForm): Record<string, string> {
  return Object.fromEntries(
    BRANDING_FIELD_KEYS.map((key) => [key, form[key].trim()])
  );
}

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

export function validateBranding(form: BrandingForm): BrandingFieldErrors {
  const errors: BrandingFieldErrors = {};

  for (const key of BRANDING_FIELD_KEYS) {
    const max = MAX_LENGTHS[key];
    if (max !== undefined && form[key].trim().length > max) {
      errors[key] = { key: "tooLong", max };
    }
  }

  const accent = form.accentHex.trim();
  if (accent && !normalizeAccentHex(accent)) {
    errors.accentHex = { key: "accentInvalid" };
  }

  const email = form.supportEmail.trim();
  if (email && !errors.supportEmail && !isEmailShaped(email)) {
    errors.supportEmail = { key: "supportEmailInvalid" };
  }

  for (const key of ["privacyPolicyUrl", "termsUrl"] as const) {
    const value = form[key].trim();
    if (value && !errors[key] && !isHttpUrl(value)) {
      errors[key] = { key: "urlInvalid" };
    }
  }

  return errors;
}

export interface ThemeContrast {
  /** What the tenant's own colour scores against that theme's page. */
  ratio: number;
  /** True when it is under 4.5:1 there and has to be moved. */
  adjusted: boolean;
  /** Which way it moves: away from the page, so darker on light and brighter on dark. */
  direction: "darker" | "brighter";
}

export interface AccentPreview {
  /** The accent, normalised. */
  accent: string;
  light: ThemeContrast;
  dark: ThemeContrast;
  /** The gold the exported report will actually be painted in. */
  reportGold: string;
  /** The "optimal portfolio" series colour, per appearance. */
  series: Record<ResolvedTheme, string>;
}

/** Away from the page in each appearance — the direction `fitContrast` moves. */
const FIT_DIRECTION: Record<ResolvedTheme, ThemeContrast["direction"]> = {
  light: "darker",
  dark: "brighter",
};

/**
 * The live reading under the colour picker: what this accent scores against
 * each page, and the colours it actually becomes.
 *
 * Reported per appearance, not as one verdict, because no single colour can
 * clear 4.5:1 against both the near-white and the near-black page — a colour
 * dark enough for one is too dark for the other. So a brand accent is always
 * fitted in at least one theme, and the useful thing to say is *which* one and
 * *which way*, not "your colour fails". `deriveTenantPalette` fits rather than
 * rejects (D9), so this never blocks a save.
 *
 * Returns null for anything that is not yet a colour, which is every keystroke
 * of typing one.
 */
export function previewAccent(value: string): AccentPreview | null {
  const accent = normalizeAccentHex(value.trim());
  if (!accent) return null;

  const palette = deriveTenantPalette(accent);
  const measure = (theme: ResolvedTheme): ThemeContrast => {
    const ratio = contrastRatio(accent, THEME_BACKGROUND_HEX[theme]);
    return { ratio, adjusted: ratio < MIN_CONTRAST, direction: FIT_DIRECTION[theme] };
  };

  return {
    accent,
    light: measure("light"),
    dark: measure("dark"),
    reportGold: palette.pdf.gold,
    series: {
      light: palette.charts.light.optimal,
      dark: palette.charts.dark.optimal,
    },
  };
}

/** One decimal is the precision a contrast ratio is ever quoted at. */
export function formatContrastRatio(ratio: number): string {
  return ratio.toFixed(1);
}
