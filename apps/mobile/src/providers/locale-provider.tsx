import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { resolveDeviceLocale, type Locale } from '@/i18n';
import { loadStoredLocale, storeLocale } from '@/lib/locale-storage';

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * Holds the active locale in React state so changing it re-renders every
 * consumer of `useTranslations()`. Initializes from the device locale, then
 * hydrates the persisted choice (if any) and writes future changes back.
 */
export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => resolveDeviceLocale());

  useEffect(() => {
    let active = true;
    loadStoredLocale().then((stored) => {
      if (active && stored) setLocaleState(stored);
    });
    return () => {
      active = false;
    };
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    void storeLocale(next);
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useLocale must be used within a LocaleProvider');
  }
  return context;
}
