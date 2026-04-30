"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";

const COUNTRY_TO_CURRENCY: Record<string, string> = {
  MX: "MXN",
  US: "USD",
  CA: "CAD",
  ES: "EUR",
  FR: "EUR",
  DE: "EUR",
  IT: "EUR",
  GB: "GBP",
  AR: "ARS",
  CL: "CLP",
  CO: "COP",
  PE: "PEN",
  BR: "BRL",
  UY: "UYU",
};

const LOCALE_FALLBACK_COUNTRY: Record<string, string> = {
  es: "MX",
  en: "US",
};

function deriveCountryFromBrowserLang(lang: string | undefined): string | null {
  if (!lang) return null;
  const parts = lang.split("-");
  if (parts.length < 2) return null;
  const region = parts[1].toUpperCase();
  return COUNTRY_TO_CURRENCY[region] ? region : null;
}

export interface AutoDetected {
  countryCode: string;
  currency: string;
  timezone: string | null;
}

export function useAutoDetect(): AutoDetected {
  const locale = useLocale();
  const [detected, setDetected] = useState<AutoDetected>(() => ({
    countryCode: LOCALE_FALLBACK_COUNTRY[locale] ?? "US",
    currency: COUNTRY_TO_CURRENCY[LOCALE_FALLBACK_COUNTRY[locale] ?? "US"] ?? "USD",
    timezone: null,
  }));

  useEffect(() => {
    const browserLang = typeof navigator !== "undefined" ? navigator.language : undefined;
    const fromBrowser = deriveCountryFromBrowserLang(browserLang);
    const country = fromBrowser ?? LOCALE_FALLBACK_COUNTRY[locale] ?? "US";
    const currency = COUNTRY_TO_CURRENCY[country] ?? "USD";
    const timezone =
      typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : null;
    setDetected({ countryCode: country, currency, timezone });
  }, [locale]);

  return detected;
}

export const SUPPORTED_COUNTRIES = Object.keys(COUNTRY_TO_CURRENCY);
export const SUPPORTED_CURRENCIES = Array.from(new Set(Object.values(COUNTRY_TO_CURRENCY)));
export { COUNTRY_TO_CURRENCY };
