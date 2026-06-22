import { useCallback } from 'react';

import { i18n } from '@/i18n';

/**
 * Returns a `t` function for reading translation keys, e.g.
 * `const t = useTranslations(); t('home.title')`.
 *
 * Mirrors the web app's `useTranslations()` ergonomics so feature code reads
 * the same way across platforms.
 */
export function useTranslations() {
  return useCallback((key: string, options?: Record<string, unknown>) => i18n.t(key, options), []);
}
