/**
 * Internationalization for the mobile app.
 *
 * Mirrors the web app's policy (`CLAUDE.md`): Spanish (`es`) is the default
 * locale, English (`en`) is also supported, and no UI strings are hardcoded.
 * The device locale is detected via `expo-localization`; unsupported locales
 * fall back to Spanish.
 */
import { getLocales } from 'expo-localization';
import { I18n } from 'i18n-js';

import en from '../../messages/en.json';
import es from '../../messages/es.json';

export const SUPPORTED_LOCALES = ['es', 'en'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'es';

export const i18n = new I18n({ es, en });

i18n.defaultLocale = DEFAULT_LOCALE;
i18n.enableFallback = true;

/** Best-effort locale from the device settings, falling back to the default. */
export function resolveDeviceLocale(): Locale {
  const deviceLanguage = getLocales()[0]?.languageCode;
  return SUPPORTED_LOCALES.includes(deviceLanguage as Locale)
    ? (deviceLanguage as Locale)
    : DEFAULT_LOCALE;
}

/** Narrow an arbitrary string to a supported locale, or `null`. */
export function asSupportedLocale(value: string | null | undefined): Locale | null {
  return value && SUPPORTED_LOCALES.includes(value as Locale) ? (value as Locale) : null;
}

i18n.locale = resolveDeviceLocale();
