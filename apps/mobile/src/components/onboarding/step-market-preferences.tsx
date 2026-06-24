import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { MultiSelectChips, toggleValue } from '@/components/onboarding/chip-group';
import { WhyTooltip } from '@/components/onboarding/why-tooltip';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translations';
import type { ConceptKey, MarketCode } from '@/lib/api/onboarding';

export type Step3Values = {
  marketsOfInterest: MarketCode[];
  otherMarkets: string[];
  conceptFamiliarity: ConceptKey[];
};

type Props = {
  value: Step3Values;
  onChange: (next: Step3Values) => void;
};

const MARKET_OPTIONS: MarketCode[] = ['MX', 'US', 'EU', 'LATAM', 'AR', 'CRYPTO'];
const CONCEPT_OPTIONS: ConceptKey[] = ['markowitz', 'sharpe', 'volatility', 'beta', 'frontier'];

const MARKET_KEY: Record<MarketCode, string> = {
  MX: 'marketMX',
  US: 'marketUS',
  EU: 'marketEU',
  LATAM: 'marketLATAM',
  AR: 'marketAR',
  CRYPTO: 'marketCRYPTO',
};

const CONCEPT_KEY: Record<ConceptKey, string> = {
  markowitz: 'conceptMarkowitz',
  sharpe: 'conceptSharpe',
  volatility: 'conceptVolatility',
  beta: 'conceptBeta',
  frontier: 'conceptFrontier',
};

/** Comma-splits the free-text field, trimming, deduping and capping like the API. */
function parseOtherMarkets(raw: string): string[] {
  const tokens = raw
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => token.slice(0, 64));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of tokens) {
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(token);
  }
  return out.slice(0, 10);
}

export function StepMarketPreferences({ value, onChange }: Props) {
  const t = useTranslations();
  const theme = useTheme();
  const [otherInput, setOtherInput] = useState<string>(() => value.otherMarkets.join(', '));

  return (
    <View style={styles.container}>
      <View style={styles.intro}>
        <ThemedText type="subtitle">{t('onboarding.step3.title')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('onboarding.step3.description')}
        </ThemedText>
      </View>

      <View style={styles.field}>
        <ThemedText type="smallBold">{t('onboarding.step3.marketsLabel')}</ThemedText>
        <MultiSelectChips
          options={MARKET_OPTIONS}
          selected={value.marketsOfInterest}
          onToggle={(market) =>
            onChange({ ...value, marketsOfInterest: toggleValue(value.marketsOfInterest, market) })
          }
          labelFor={(option) => t(`onboarding.step3.${MARKET_KEY[option]}`)}
        />
        <ThemedText type="small" themeColor="textSecondary">
          {t('onboarding.step3.marketsHint')}
        </ThemedText>
      </View>

      <View style={styles.field}>
        <ThemedText type="smallBold">{t('onboarding.step3.otherMarketsLabel')}</ThemedText>
        <TextInput
          value={otherInput}
          onChangeText={(raw) => {
            setOtherInput(raw);
            onChange({ ...value, otherMarkets: parseOtherMarkets(raw) });
          }}
          placeholder={t('onboarding.step3.otherMarketsPlaceholder')}
          placeholderTextColor={theme.textSecondary}
          autoCorrect={false}
          accessibilityLabel={t('onboarding.step3.otherMarketsLabel')}
          style={[
            styles.input,
            {
              color: theme.text,
              borderColor: theme.border,
              backgroundColor: theme.backgroundElement,
            },
          ]}
        />
        <ThemedText type="small" themeColor="textSecondary">
          {t('onboarding.step3.otherMarketsHint')}
        </ThemedText>
      </View>

      <View style={styles.field}>
        <View style={styles.labelRow}>
          <ThemedText type="smallBold">{t('onboarding.step3.conceptsLabel')}</ThemedText>
          <WhyTooltip content={t('onboarding.step3.whyConcepts')} />
        </View>
        <MultiSelectChips
          options={CONCEPT_OPTIONS}
          selected={value.conceptFamiliarity}
          onToggle={(concept) =>
            onChange({
              ...value,
              conceptFamiliarity: toggleValue(value.conceptFamiliarity, concept),
            })
          }
          labelFor={(option) => t(`onboarding.step3.${CONCEPT_KEY[option]}`)}
        />
      </View>
    </View>
  );
}

export function isStep3Valid(v: Step3Values): boolean {
  return v.marketsOfInterest.length + v.otherMarkets.length >= 1;
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
    alignItems: 'flex-start',
    gap: Spacing.one,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
});
