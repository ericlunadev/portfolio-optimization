// Which payment rails this tenant may use (PLAN Task 2.7).
//
// Card is always on. Crypto is a per-tenant switch, because a corporate finance
// department pays by card or on an invoice and a "Pay with crypto" tab is noise
// in a whitelabel app. `GET /api/billing/rails` answers for the caller's own
// organization; the server refuses the rail too, so this is presentation only.
//
// Pure, like `lib/org-settings.ts`, so the decision is testable without a DOM.

export type Rail = "stripe" | "coinbase_commerce";

/**
 * What the picker assumes until the server answers.
 *
 * Card only, deliberately. Guessing the other way shows a whitelabel tenant a
 * crypto tab for the length of one fetch and then takes it away — and of the two
 * wrong guesses, offering a rail the organization has switched off is the one
 * that reaches a client meeting.
 */
export const RAILS_FALLBACK: Rail[] = ["stripe"];

export function resolveRails(data: { rails: Rail[] } | undefined): Rail[] {
  if (!data?.rails?.length) return RAILS_FALLBACK;
  return data.rails;
}

export function isRailAvailable(rails: Rail[], rail: Rail): boolean {
  return rails.includes(rail);
}
