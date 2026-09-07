// The tenant product switches the UI reads, and the pure decisions taken from
// them. PLAN Tasks 3.2 (Academia) and 3.3 (advisor CTA).
//
// Kept apart from the fetching hook so the decisions are testable in the node
// test environment the web suite runs today. The hook is `useOrgSettings`.

export type AdvisorMode = "off" | "platform" | "tenant";

export type AdvisorSettings = {
  mode: AdvisorMode;
  /** False for `off`, and for a tenant that has not configured a booking URL. */
  bookable: boolean;
  costCredits: number;
  /**
   * Who the call is with, when that is not us. The advisor's identity is data
   * precisely so no translated string has to carry a possessive — "our advisor"
   * baked into `es.json` is a sentence a tenant would inherit unchanged.
   */
  providerName: string | null;
};

export type OrgSettings = {
  academiaEnabled: boolean;
  advisor: AdvisorSettings;
};

/**
 * What the UI assumes until `GET /api/organizations/settings` answers.
 *
 * The two halves default in opposite directions on purpose. Academia matches the
 * column default, so the D2C nav does not lose and regain a tab on every cold
 * load; a tenant that switched it off sees it for the length of one fetch, which
 * is cosmetic. The advisor does not get that benefit of the doubt: guessing
 * `bookable` wrong points a tenant's clients at our advisor, which is the
 * channel conflict — and the licensing problem — Task 3.3 exists to remove.
 */
export const ORG_SETTINGS_FALLBACK: OrgSettings = {
  academiaEnabled: true,
  advisor: { mode: "off", bookable: false, costCredits: 0, providerName: null },
};

export function resolveOrgSettings(data: OrgSettings | undefined): OrgSettings {
  return data ?? ORG_SETTINGS_FALLBACK;
}

/** Hrefs that only exist for some tenants. Everything else is always in the nav. */
export function isNavHrefVisible(href: string, settings: OrgSettings): boolean {
  if (href === "/academia") return settings.academiaEnabled;
  return true;
}

/**
 * Tailwind column count for the mobile tab bar, which loses a column when
 * Academia is off. Written as whole class names because Tailwind scans source
 * text and never sees an interpolated one.
 */
export function navGridClass(itemCount: number): string {
  return itemCount === 3 ? "grid-cols-3" : "grid-cols-4";
}

export type AdvisorCtaView =
  | { visible: false }
  | { visible: true; costCredits: number; providerName: string | null };

/** Whether to render the booking CTA at all, and with what. */
export function advisorCtaView(settings: OrgSettings): AdvisorCtaView {
  const { advisor } = settings;
  if (!advisor.bookable) return { visible: false };

  return {
    visible: true,
    costCredits: advisor.costCredits,
    providerName: advisor.providerName,
  };
}
