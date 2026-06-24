import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { SelectModal, type SelectOption } from '@/components/onboarding/select-modal';
import { WhyTooltip } from '@/components/onboarding/why-tooltip';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTranslations } from '@/hooks/use-translations';
import {
  COUNTRY_TO_CURRENCY,
  SUPPORTED_COUNTRIES,
  SUPPORTED_CURRENCIES,
} from '@/lib/onboarding/auto-detect';

export type Step1Values = {
  countryCode: string;
  currency: string;
};

type Props = {
  value: Step1Values;
  onChange: (next: Step1Values) => void;
};

export function StepLocalization({ value, onChange }: Props) {
  const t = useTranslations();

  const countryOptions = useMemo<SelectOption[]>(
    () =>
      SUPPORTED_COUNTRIES.map((code) => ({
        value: code,
        label: t(`onboarding.countries.${code}`),
      })).sort((a, b) => a.label.localeCompare(b.label)),
    [t],
  );

  const currencyOptions = useMemo<SelectOption[]>(
    () => SUPPORTED_CURRENCIES.map((code) => ({ value: code, label: code })),
    [],
  );

  const handleCountryChange = (countryCode: string) => {
    const inferredCurrency = COUNTRY_TO_CURRENCY[countryCode];
    onChange({ countryCode, currency: inferredCurrency ?? value.currency });
  };

  return (
    <View style={styles.container}>
      <View style={styles.intro}>
        <ThemedText type="subtitle">{t('onboarding.step1.title')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('onboarding.step1.description')}
        </ThemedText>
      </View>

      <View style={styles.field}>
        <View style={styles.labelRow}>
          <ThemedText type="smallBold">{t('onboarding.step1.countryLabel')}</ThemedText>
          <WhyTooltip content={t('onboarding.step1.whyCountry')} />
        </View>
        <SelectModal
          label={t('onboarding.step1.countryLabel')}
          accessibilityLabel={t('onboarding.step1.countryLabel')}
          value={value.countryCode}
          options={countryOptions}
          onSelect={handleCountryChange}
        />
      </View>

      <View style={styles.field}>
        <View style={styles.labelRow}>
          <ThemedText type="smallBold">{t('onboarding.step1.currencyLabel')}</ThemedText>
          <WhyTooltip content={t('onboarding.step1.whyCurrency')} />
        </View>
        <SelectModal
          label={t('onboarding.step1.currencyLabel')}
          accessibilityLabel={t('onboarding.step1.currencyLabel')}
          value={value.currency}
          options={currencyOptions}
          searchable={false}
          onSelect={(currency) => onChange({ ...value, currency })}
        />
      </View>
    </View>
  );
}

export function isStep1Valid(v: Step1Values): boolean {
  return v.countryCode.length === 2 && v.currency.length === 3;
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.four,
  },
  intro: {
    gap: Spacing.one,
  },
  field: {
    gap: Spacing.two,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
});
