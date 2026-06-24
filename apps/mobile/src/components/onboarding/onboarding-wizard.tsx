import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  StepInvestorProfile,
  isStep2Valid,
  type Step2Values,
} from '@/components/onboarding/step-investor-profile';
import {
  StepLocalization,
  isStep1Valid,
  type Step1Values,
} from '@/components/onboarding/step-localization';
import {
  StepMarketPreferences,
  isStep3Valid,
  type Step3Values,
} from '@/components/onboarding/step-market-preferences';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translations';
import { useCompleteOnboarding, usePatchOnboardingStep } from '@/hooks/use-onboarding';
import { useLocale } from '@/providers/locale-provider';
import type { UserProfile } from '@/lib/api/onboarding';
import { resolveAutoDetect } from '@/lib/onboarding/auto-detect';

const TOTAL_STEPS = 3;

type Step = 1 | 2 | 3;

function clampStep(n: number | undefined | null): Step {
  if (!n || n < 1) return 1;
  if (n > TOTAL_STEPS) return TOTAL_STEPS;
  return n as Step;
}

/**
 * Full-screen onboarding wizard. Holds the step cursor and per-step state
 * locally (mirroring web's `WizardShell`), persists each step via PATCH on Next,
 * and POSTs `/complete` on the final step. On success the gate falls through to
 * the tabs because the cached profile now has a `completedAt`.
 */
export function OnboardingWizard({ initialProfile }: { initialProfile: UserProfile }) {
  const t = useTranslations();
  const theme = useTheme();
  const { locale } = useLocale();
  const detected = useMemo(() => resolveAutoDetect(locale), [locale]);

  const patch = usePatchOnboardingStep();
  const complete = useCompleteOnboarding();

  const [step, setStep] = useState<Step>(() => clampStep(initialProfile.currentStep));
  const [error, setError] = useState<string | null>(null);

  const [step1, setStep1] = useState<Step1Values>(() => ({
    countryCode: initialProfile.countryCode ?? detected.countryCode,
    currency: initialProfile.currency ?? detected.currency,
  }));
  const [step2, setStep2] = useState<Step2Values>(() => ({
    experience: initialProfile.experience ?? '',
    horizon: initialProfile.horizon ?? '',
    riskBehavior: initialProfile.riskBehavior ?? '',
    goal: initialProfile.goal ?? '',
  }));
  const [step3, setStep3] = useState<Step3Values>(() => ({
    marketsOfInterest: initialProfile.marketsOfInterest ?? [],
    otherMarkets: initialProfile.otherMarkets ?? [],
    conceptFamiliarity: initialProfile.conceptFamiliarity ?? [],
  }));

  const isCurrentValid =
    (step === 1 && isStep1Valid(step1)) ||
    (step === 2 && isStep2Valid(step2)) ||
    (step === 3 && isStep3Valid(step3));

  const isBusy = patch.isPending || complete.isPending;

  const handleNext = async () => {
    setError(null);
    try {
      if (step === 1) {
        await patch.mutateAsync({ step: 1, data: step1 });
        setStep(2);
        return;
      }
      if (step === 2) {
        await patch.mutateAsync({
          step: 2,
          data: {
            experience: step2.experience as Exclude<Step2Values['experience'], ''>,
            horizon: step2.horizon as Exclude<Step2Values['horizon'], ''>,
            riskBehavior: step2.riskBehavior as Exclude<Step2Values['riskBehavior'], ''>,
            goal: step2.goal as Exclude<Step2Values['goal'], ''>,
          },
        });
        setStep(3);
        return;
      }
      await patch.mutateAsync({ step: 3, data: step3 });
      // Completing seeds the cache with `completedAt` set, so the gate dismisses.
      await complete.mutateAsync();
    } catch {
      setError(t('onboarding.errorGeneric'));
    }
  };

  const handleBack = () => {
    setError(null);
    if (step > 1) setStep((step - 1) as Step);
  };

  const progressPct = (step / TOTAL_STEPS) * 100;
  const nextLabel = isBusy
    ? t('onboarding.saving')
    : step === TOTAL_STEPS
      ? t('onboarding.finish')
      : t('onboarding.next');

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag">
          <View style={styles.progress}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              {t('onboarding.progress', { current: step, total: TOTAL_STEPS })}
            </ThemedText>
            <View style={[styles.progressTrack, { backgroundColor: theme.backgroundElement }]}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${progressPct}%`, backgroundColor: theme.tint },
                ]}
              />
            </View>
          </View>

          {step === 1 ? <StepLocalization value={step1} onChange={setStep1} /> : null}
          {step === 2 ? <StepInvestorProfile value={step2} onChange={setStep2} /> : null}
          {step === 3 ? <StepMarketPreferences value={step3} onChange={setStep3} /> : null}

          {error ? (
            <ThemedText type="small" themeColor="negative">
              {error}
            </ThemedText>
          ) : null}
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: theme.border }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('onboarding.back')}
            disabled={step === 1 || isBusy}
            onPress={handleBack}
            hitSlop={Spacing.two}
            style={({ pressed }) => [
              styles.backButton,
              (step === 1 || isBusy) && styles.disabled,
              pressed && styles.pressed,
            ]}>
            <ThemedText type="small" themeColor="textSecondary">
              {t('onboarding.back')}
            </ThemedText>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={nextLabel}
            accessibilityState={{ disabled: !isCurrentValid || isBusy }}
            disabled={!isCurrentValid || isBusy}
            onPress={handleNext}
            style={({ pressed }) => [
              styles.nextButton,
              { backgroundColor: theme.tint },
              (!isCurrentValid || isBusy) && styles.disabled,
              pressed && !(!isCurrentValid || isBusy) && styles.pressed,
            ]}>
            {isBusy ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <ThemedText type="small" style={styles.nextLabel}>
                {nextLabel}
              </ThemedText>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  progress: {
    gap: Spacing.two,
  },
  progressTrack: {
    height: Spacing.one,
    borderRadius: Spacing.one,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: Spacing.one,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  nextButton: {
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  nextLabel: {
    color: '#ffffff',
    fontWeight: 700,
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.85,
  },
});
