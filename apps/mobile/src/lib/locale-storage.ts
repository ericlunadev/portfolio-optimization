import * as SecureStore from 'expo-secure-store';

import { asSupportedLocale, type Locale } from '@/i18n';

/**
 * Persists the user's chosen locale across launches. Backed by
 * `expo-secure-store`; failures (e.g. the unsupported web platform) are
 * swallowed so a missing store never breaks rendering — the app just falls back
 * to the device locale.
 */
const STORAGE_KEY = 'portfoliooptimization.locale';

export async function loadStoredLocale(): Promise<Locale | null> {
  try {
    return asSupportedLocale(await SecureStore.getItemAsync(STORAGE_KEY));
  } catch {
    return null;
  }
}

export async function storeLocale(locale: Locale): Promise<void> {
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, locale);
  } catch {
    // Non-fatal: the choice simply won't persist on this platform.
  }
}
