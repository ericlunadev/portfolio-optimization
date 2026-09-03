import { describe, expect, it } from "vitest";
import {
  formatContrastRatio,
  isDirty,
  previewAccent,
  toForm,
  toRequestBody,
  validateBranding,
  type BrandingForm,
  type BrandingSettings,
} from "./form";
import { MIN_CONTRAST, deriveTenantPalette } from "@/lib/tenant-palette";

const empty: BrandingForm = {
  productName: "",
  productShortName: "",
  tagline: "",
  accentHex: "",
  fontKey: "",
  supportEmail: "",
  privacyPolicyUrl: "",
  termsUrl: "",
  disclaimerText: "",
};

function form(overrides: Partial<BrandingForm> = {}): BrandingForm {
  return { ...empty, ...overrides };
}

const settings: BrandingSettings = {
  organizationId: "org-1",
  organizationName: "Meridian Capital",
  tier: "cobranded",
  productName: "Meridian Portfolio",
  productShortName: null,
  tagline: null,
  accentHex: "#2f6f4f",
  fontKey: "manrope",
  logoUrl: null,
  faviconUrl: null,
  supportEmail: "help@meridian.example",
  privacyPolicyUrl: null,
  termsUrl: null,
  disclaimerText: null,
  fontKeys: ["instrument-sans", "manrope"],
};

describe("toForm", () => {
  it("turns every null column into an empty box", () => {
    expect(toForm(settings)).toEqual(
      form({
        productName: "Meridian Portfolio",
        accentHex: "#2f6f4f",
        fontKey: "manrope",
        supportEmail: "help@meridian.example",
      })
    );
  });
});

describe("isDirty", () => {
  it("ignores whitespace-only edits", () => {
    const original = form({ productName: "Meridian" });

    expect(isDirty(form({ productName: "  Meridian  " }), original)).toBe(false);
    expect(isDirty(form({ productName: "Meridian " }), original)).toBe(false);
    expect(isDirty(form({ productName: "Meridian Portfolio" }), original)).toBe(true);
  });

  it("counts emptying a field as a change", () => {
    expect(isDirty(empty, form({ tagline: "Allocation, decided." }))).toBe(true);
  });
});

describe("toRequestBody", () => {
  it("sends every field, so an emptied box clears its column", () => {
    const body = toRequestBody(form({ productName: " Meridian " }));

    expect(body.productName).toBe("Meridian");
    expect(body.tagline).toBe("");
    expect(Object.keys(body)).toHaveLength(9);
  });
});

describe("validateBranding", () => {
  it("passes an empty form: every field is optional", () => {
    expect(validateBranding(empty)).toEqual({});
  });

  it("rejects an accent that is not a hex colour", () => {
    expect(validateBranding(form({ accentHex: "rebeccapurple" }))).toEqual({
      accentHex: { key: "accentInvalid" },
    });
  });

  it("accepts shorthand hex, with or without the hash", () => {
    expect(validateBranding(form({ accentHex: "#2f6" }))).toEqual({});
    expect(validateBranding(form({ accentHex: "2f6f4f" }))).toEqual({});
  });

  it("rejects a malformed support email", () => {
    expect(validateBranding(form({ supportEmail: "help at meridian" }))).toEqual({
      supportEmail: { key: "supportEmailInvalid" },
    });
  });

  it("rejects a policy link that is not http(s)", () => {
    expect(validateBranding(form({ termsUrl: "meridian.example/terms" }))).toEqual({
      termsUrl: { key: "urlInvalid" },
    });
    expect(validateBranding(form({ termsUrl: "javascript:alert(1)" }))).toEqual({
      termsUrl: { key: "urlInvalid" },
    });
    expect(
      validateBranding(form({ termsUrl: "https://meridian.example/terms" }))
    ).toEqual({});
  });

  it("reports over-long text with the limit it broke", () => {
    expect(validateBranding(form({ productName: "x".repeat(61) }))).toEqual({
      productName: { key: "tooLong", max: 60 },
    });
  });
});

describe("previewAccent", () => {
  it("returns nothing while the colour is still being typed", () => {
    expect(previewAccent("")).toBeNull();
    expect(previewAccent("#2f6f")).toBeNull();
  });

  it("warns that a pale accent has to be darkened for the light page", () => {
    // The adversarial case PLAN's Phase 1 DoD names: pale yellow.
    const preview = previewAccent("#f7e7a1");

    expect(preview?.light.adjusted).toBe(true);
    expect(preview?.light.ratio).toBeLessThan(MIN_CONTRAST);
    // ...while being perfectly readable on the dark page.
    expect(preview?.dark.adjusted).toBe(false);
    expect(preview?.dark.ratio).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });

  it("warns that a very dark accent has to be brightened for the dark page", () => {
    const preview = previewAccent("#101820");

    expect(preview?.dark.adjusted).toBe(true);
    expect(preview?.light.adjusted).toBe(false);
  });

  it("always moves the colour away from the page it sits on", () => {
    const preview = previewAccent("#2f6f4f");

    expect(preview?.light.direction).toBe("darker");
    expect(preview?.dark.direction).toBe("brighter");
  });

  it("never reports both pages as fine, because no colour can be", () => {
    // A near-white page and a near-black one cannot both be cleared at 4.5:1:
    // dark enough for one is too dark for the other. Said out loud so nobody
    // reintroduces a single "your accent passes" verdict.
    for (const accent of ["#2f6f4f", "#f7e7a1", "#101820", "#d7a042", "#ffffff"]) {
      const preview = previewAccent(accent);
      expect(preview?.light.adjusted || preview?.dark.adjusted).toBe(true);
    }
  });

  it("shows the colours the report and the charts will really use", () => {
    const palette = deriveTenantPalette("#2f6f4f");
    const preview = previewAccent("  #2F6F4F  ");

    expect(preview?.accent).toBe("#2f6f4f");
    expect(preview?.reportGold).toBe(palette.pdf.gold);
    expect(preview?.series.dark).toBe(palette.charts.dark.optimal);
    expect(preview?.series.light).toBe(palette.charts.light.optimal);
  });
});

describe("formatContrastRatio", () => {
  it("quotes one decimal", () => {
    expect(formatContrastRatio(4.4721)).toBe("4.5");
    expect(formatContrastRatio(12)).toBe("12.0");
  });
});
