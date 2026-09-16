import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { organizationSettings } from "../db/schema.js";
import { env } from "../config/env.js";

// Who the "book a call" CTA books, and what it costs, resolved per organization.
//
// Both facts used to be deployment-wide env vars, which is wrong the moment a
// second tenant exists: it points *their* clients at *our* advisor. See PLAN
// Task 3.3. The env vars survive only as the platform advisor's own link and as
// the provisioning default for `advisor_cost_credits`.

export const ADVISOR_MODES = ["off", "platform", "tenant"] as const;

export type AdvisorMode = (typeof ADVISOR_MODES)[number];

export type AdvisorConfig = {
  mode: AdvisorMode;
  /** Credits `POST /api/billing/advisor-call` charges for one booking. */
  costCredits: number;
  /** Where the booking lands. Null whenever `bookable` is false. */
  bookingUrl: string | null;
  /**
   * False for `off`, and for a `tenant` that has not configured a URL yet —
   * charging for a link we cannot hand back is worse than offering nothing.
   */
  bookable: boolean;
};

function isAdvisorMode(value: string): value is AdvisorMode {
  return (ADVISOR_MODES as readonly string[]).includes(value);
}

/**
 * The organization's advisor configuration.
 *
 * Falls back to `off` for an organization with no settings row and for an
 * unrecognised `advisor_mode`: silence is the safe failure for a tenant, and
 * matches the column default.
 */
export async function resolveAdvisorConfig(
  organizationId: string
): Promise<AdvisorConfig> {
  const settings = await db.query.organizationSettings.findFirst({
    where: eq(organizationSettings.organizationId, organizationId),
    columns: {
      advisorMode: true,
      advisorBookingUrl: true,
      advisorCostCredits: true,
    },
  });

  const mode: AdvisorMode =
    settings && isAdvisorMode(settings.advisorMode) ? settings.advisorMode : "off";

  const bookingUrl =
    mode === "platform"
      ? env.ADVISOR_BOOKING_URL
      : mode === "tenant"
        ? settings?.advisorBookingUrl ?? null
        : null;

  return {
    mode,
    costCredits: settings?.advisorCostCredits ?? env.ADVISOR_CALL_COST_CREDITS,
    bookingUrl,
    bookable: bookingUrl !== null,
  };
}
