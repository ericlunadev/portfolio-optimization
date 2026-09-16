/**
 * A tenant may reword the investing disclaimer — their compliance desk usually
 * insists — but may not remove it. `organization_branding.disclaimer_text` is
 * nullable and a settings form happily writes an empty string into it, so the
 * wording is configurable and the presence is not: anything blank falls back to
 * the `Legal` copy shipped in the message files.
 */
export function resolveDisclaimerText(
  tenantText: string | null | undefined,
  fallback: string
): string {
  return tenantText?.trim() || fallback;
}
