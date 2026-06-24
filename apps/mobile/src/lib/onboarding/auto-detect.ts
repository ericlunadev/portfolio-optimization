/**
 * Auto-detect sensible localization defaults for the onboarding wizard.
 *
 * RN port of the web `useAutoDetect` hook: instead of `navigator.language`, the
 * region/currency come from `expo-localization`'s `getLocales()`, which is
 * synchronous so the values can seed the wizard's initial state directly.
 */
import { getLocales } from 'expo-localization';

import type { Locale } from '@/i18n';

const COUNTRY_TO_CURRENCY: Record<string, string> = {
  MX: 'MXN',
  US: 'USD',
  CA: 'CAD',
  ES: 'EUR',
  FR: 'EUR',
  DE: 'EUR',
  IT: 'EUR',
  GB: 'GBP',
  AR: 'ARS',
  CL: 'CLP',
  CO: 'COP',
  PE: 'PEN',
  BR: 'BRL',
  UY: 'UYU',
};

const LOCALE_FALLBACK_COUNTRY: Record<Locale, string> = {
  es: 'MX',
  en: 'US',
};

export type AutoDetected = {
  countryCode: string;
  currency: string;
};

/**
 * Resolves the best-guess country + currency for the given app locale, using the
 * device region when it maps to a supported currency and falling back to the
 * locale's default country otherwise.
 */
export function resolveAutoDetect(locale: Locale): AutoDetected {
  const deviceRegion = getLocales()[0]?.regionCode?.toUpperCase();
  const fallbackCountry = LOCALE_FALLBACK_COUNTRY[locale] ?? 'US';
  const countryCode =
    deviceRegion && COUNTRY_TO_CURRENCY[deviceRegion] ? deviceRegion : fallbackCountry;
  const currency = COUNTRY_TO_CURRENCY[countryCode] ?? 'USD';
  return { countryCode, currency };
}

export const SUPPORTED_COUNTRIES = Object.keys(COUNTRY_TO_CURRENCY);
export const SUPPORTED_CURRENCIES = Array.from(new Set(Object.values(COUNTRY_TO_CURRENCY)));
export { COUNTRY_TO_CURRENCY };
