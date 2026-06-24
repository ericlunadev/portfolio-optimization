import { StyleSheet, View } from 'react-native';

import { SingleSelectChips } from '@/components/onboarding/chip-group';
import { WhyTooltip } from '@/components/onboarding/why-tooltip';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTranslations } from '@/hooks/use-translations';
import type {
  ExperienceLevel,
  InvestmentGoal,
  InvestmentHorizon,
  RiskBehavior,
} from '@/lib/api/onboarding';

export type Step2Values = {
  experience: ExperienceLevel | '';
  horizon: InvestmentHorizon | '';
  riskBehavior: RiskBehavior | '';
  goal: InvestmentGoal | '';
};

type Props = {
  value: Step2Values;
  onChange: (next: Step2Values) => void;
};

const EXPERIENCE_OPTIONS: ExperienceLevel[] = ['none', 'beginner', 'intermediate', 'advanced'];
const HORIZON_OPTIONS: InvestmentHorizon[] = ['short', 'medium', 'long'];
const RISK_OPTIONS: RiskBehavior[] = ['sell_all', 'sell_some', 'hold', 'buy_more'];
const GOAL_OPTIONS: InvestmentGoal[] = ['retirement', 'growth', 'preservation', 'specific'];

const EXPERIENCE_KEY: Record<ExperienceLevel, string> = {
  none: 'experienceNone',
  beginner: 'experienceBeginner',
  intermediate: 'experienceIntermediate',
  advanced: 'experienceAdvanced',
};

const HORIZON_KEY: Record<InvestmentHorizon, string> = {
  short: 'horizonShort',
  medium: 'horizonMedium',
  long: 'horizonLong',
};

const RISK_KEY: Record<RiskBehavior, string> = {
  sell_all: 'riskSellAll',
  sell_some: 'riskSellSome',
  hold: 'riskHold',
  buy_more: 'riskBuyMore',
};

const GOAL_KEY: Record<InvestmentGoal, string> = {
  retirement: 'goalRetirement',
  growth: 'goalGrowth',
  preservation: 'goalPreservation',
  specific: 'goalSpecific',
};

export function StepInvestorProfile({ value, onChange }: Props) {
  const t = useTranslations();

  return (
    <View style={styles.container}>
      <View style={styles.intro}>
        <ThemedText type="subtitle">{t('onboarding.step2.title')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('onboarding.step2.description')}
        </ThemedText>
      </View>

      <View style={styles.field}>
        <ThemedText type="smallBold">{t('onboarding.step2.experienceLabel')}</ThemedText>
        <SingleSelectChips
          options={EXPERIENCE_OPTIONS}
          value={value.experience}
          onChange={(experience) => onChange({ ...value, experience })}
          labelFor={(option) => t(`onboarding.step2.${EXPERIENCE_KEY[option]}`)}
        />
      </View>

      <View style={styles.field}>
        <ThemedText type="smallBold">{t('onboarding.step2.horizonLabel')}</ThemedText>
        <SingleSelectChips
          options={HORIZON_OPTIONS}
          value={value.horizon}
          onChange={(horizon) => onChange({ ...value, horizon })}
          labelFor={(option) => t(`onboarding.step2.${HORIZON_KEY[option]}`)}
        />
      </View>

      <View style={styles.field}>
        <View style={styles.labelRow}>
          <ThemedText type="smallBold">{t('onboarding.step2.riskQuestion')}</ThemedText>
          <WhyTooltip content={t('onboarding.step2.whyRisk')} />
        </View>
        <SingleSelectChips
          options={RISK_OPTIONS}
          value={value.riskBehavior}
          onChange={(riskBehavior) => onChange({ ...value, riskBehavior })}
          labelFor={(option) => t(`onboarding.step2.${RISK_KEY[option]}`)}
        />
      </View>

      <View style={styles.field}>
        <ThemedText type="smallBold">{t('onboarding.step2.goalLabel')}</ThemedText>
        <SingleSelectChips
          options={GOAL_OPTIONS}
          value={value.goal}
          onChange={(goal) => onChange({ ...value, goal })}
          labelFor={(option) => t(`onboarding.step2.${GOAL_KEY[option]}`)}
        />
      </View>
    </View>
  );
}

export function isStep2Valid(v: Step2Values): boolean {
  return v.experience !== '' && v.horizon !== '' && v.riskBehavior !== '' && v.goal !== '';
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
});
