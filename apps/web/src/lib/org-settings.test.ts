// PLAN Tasks 3.2 and 3.3 on the web side: what the Academia toggle and the three
// advisor modes make the UI do.
//
// The suite runs in the node environment (no jsdom yet — PLAN Task 1.9 owns the
// component harness), which is why these decisions live in `org-settings.ts`
// instead of inside the components that take them.

import { describe, expect, it } from "vitest";
import {
  ORG_SETTINGS_FALLBACK,
  advisorCtaView,
  isNavHrefVisible,
  navGridClass,
  resolveOrgSettings,
  type AdvisorMode,
  type OrgSettings,
} from "./org-settings";

function settings(overrides: {
  academiaEnabled?: boolean;
  mode?: AdvisorMode;
  bookable?: boolean;
  costCredits?: number;
  providerName?: string | null;
}): OrgSettings {
  return {
    academiaEnabled: overrides.academiaEnabled ?? true,
    advisor: {
      mode: overrides.mode ?? "off",
      bookable: overrides.bookable ?? false,
      costCredits: overrides.costCredits ?? 100,
      providerName: overrides.providerName ?? null,
    },
  };
}

describe("resolveOrgSettings", () => {
  it("falls back while the tenant's settings are unknown", () => {
    expect(resolveOrgSettings(undefined)).toBe(ORG_SETTINGS_FALLBACK);
  });

  it("never assumes an advisor is bookable, which would point a tenant at ours", () => {
    expect(ORG_SETTINGS_FALLBACK.advisor.bookable).toBe(false);
    expect(ORG_SETTINGS_FALLBACK.advisor.mode).toBe("off");
  });

  it("assumes Academia is on, matching the column default and today's D2C nav", () => {
    expect(ORG_SETTINGS_FALLBACK.academiaEnabled).toBe(true);
  });

  it("prefers the tenant's own answer once it arrives", () => {
    const own = settings({ academiaEnabled: false, mode: "platform", bookable: true });
    expect(resolveOrgSettings(own)).toEqual(own);
  });
});

describe("Academia toggle (PLAN Task 3.2)", () => {
  it("keeps /academia in the nav when the organization has it enabled", () => {
    expect(isNavHrefVisible("/academia", settings({ academiaEnabled: true }))).toBe(true);
  });

  it("drops /academia from the nav when the organization has it disabled", () => {
    expect(isNavHrefVisible("/academia", settings({ academiaEnabled: false }))).toBe(false);
  });

  it("leaves every other destination alone", () => {
    const off = settings({ academiaEnabled: false });
    for (const href of ["/", "/efficient-frontier", "/billing"]) {
      expect(isNavHrefVisible(href, off)).toBe(true);
    }
  });

  it("narrows the mobile tab bar to the columns that are left", () => {
    expect(navGridClass(4)).toBe("grid-cols-4");
    expect(navGridClass(3)).toBe("grid-cols-3");
  });
});

describe("advisor CTA modes (PLAN Task 3.3)", () => {
  it("'off' renders nothing", () => {
    expect(advisorCtaView(settings({ mode: "off", bookable: false }))).toEqual({
      visible: false,
    });
  });

  it("'platform' renders our advisor with no tenant name attached", () => {
    expect(
      advisorCtaView(
        settings({ mode: "platform", bookable: true, costCredits: 100 })
      )
    ).toEqual({ visible: true, costCredits: 100, providerName: null });
  });

  it("'tenant' renders the tenant's own advisor, price and name", () => {
    expect(
      advisorCtaView(
        settings({
          mode: "tenant",
          bookable: true,
          costCredits: 250,
          providerName: "Acme Capital",
        })
      )
    ).toEqual({ visible: true, costCredits: 250, providerName: "Acme Capital" });
  });

  it("renders nothing for a 'tenant' that has not configured a booking URL", () => {
    expect(
      advisorCtaView(settings({ mode: "tenant", bookable: false, costCredits: 250 }))
    ).toEqual({ visible: false });
  });
});
