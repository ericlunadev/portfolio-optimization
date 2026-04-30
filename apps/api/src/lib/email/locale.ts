const SUPPORTED_LOCALES = ["es", "en"] as const;
export type EmailLocale = (typeof SUPPORTED_LOCALES)[number];

const DEFAULT_LOCALE: EmailLocale = "es";
const LOCALE_COOKIE_NAME = "NEXT_LOCALE";

export function getLocaleFromRequest(request?: Request): EmailLocale {
  if (!request) return DEFAULT_LOCALE;

  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return DEFAULT_LOCALE;

  for (const segment of cookieHeader.split(";")) {
    const [rawName, ...rest] = segment.trim().split("=");
    if (rawName !== LOCALE_COOKIE_NAME) continue;
    const value = decodeURIComponent(rest.join("=")).trim();
    if ((SUPPORTED_LOCALES as readonly string[]).includes(value)) {
      return value as EmailLocale;
    }
  }

  return DEFAULT_LOCALE;
}
