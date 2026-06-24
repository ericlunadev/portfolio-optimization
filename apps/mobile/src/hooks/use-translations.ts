import { useCallback } from 'react';

import { i18n } from '@/i18n';
import { useLocale } from '@/providers/locale-provider';

/**
 * Returns a `t` function for reading translation keys, e.g.
 * `const t = useTranslations(); t('home.title')`.
 *
 * Mirrors the web app's `useTranslations()` ergonomics so feature code reads
 * the same way across platforms. The active locale comes from `LocaleProvider`
 * and is passed per call, so switching locale re-renders every consumer.
 */
export function useTranslations() {
  const { locale } = useLocale();
  return useCallback(
    (key: string, options?: Record<string, unknown>) => i18n.t(key, { locale, ...options }),
    [locale],
  );
}
