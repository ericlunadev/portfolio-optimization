"use client";

import { useTranslations } from "next-intl";
import { WhyTooltip } from "./WhyTooltip";
import { COUNTRY_TO_CURRENCY, SUPPORTED_COUNTRIES, SUPPORTED_CURRENCIES } from "./useAutoDetect";

export interface Step1Values {
  countryCode: string;
  currency: string;
}

interface Props {
  value: Step1Values;
  onChange: (next: Step1Values) => void;
}

export function StepLocalization({ value, onChange }: Props) {
  const t = useTranslations("Onboarding.step1");

  const handleCountryChange = (countryCode: string) => {
    const inferredCurrency = COUNTRY_TO_CURRENCY[countryCode];
    onChange({
      countryCode,
      currency: inferredCurrency ?? value.currency,
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-2xl text-foreground">{t("title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </div>

      <label className="block">
        <span className="flex items-center text-sm font-medium text-foreground">
          {t("countryLabel")}
          <WhyTooltip content={t("whyCountry")} />
        </span>
        <select
          value={value.countryCode}
          onChange={(e) => handleCountryChange(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          {SUPPORTED_COUNTRIES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="flex items-center text-sm font-medium text-foreground">
          {t("currencyLabel")}
          <WhyTooltip content={t("whyCurrency")} />
        </span>
        <select
          value={value.currency}
          onChange={(e) => onChange({ ...value, currency: e.target.value })}
          className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          {SUPPORTED_CURRENCIES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function isStep1Valid(v: Step1Values): boolean {
  return v.countryCode.length === 2 && v.currency.length === 3;
}
