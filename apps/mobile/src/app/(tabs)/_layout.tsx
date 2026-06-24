import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { OnboardingGate } from '@/components/onboarding/onboarding-gate';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translations';

export default function TabsLayout() {
  return (
    <OnboardingGate>
      <TabsNavigator />
    </OnboardingGate>
  );
}

/**
 * Native iOS tab bar so the app adopts the system Liquid Glass material on
 * iOS 26 (falls back to a standard native tab bar below it). We deliberately
 * leave `backgroundColor`/`blurEffect` unset so the OS renders its own glass;
 * only the selected `tintColor` is branded (gold). Icons are SF Symbols.
 */
function TabsNavigator() {
  const theme = useTheme();
  const t = useTranslations();

  // Pin each tab's content background to the brand navy so a freshly-mounted
  // screen doesn't flash the system-default (light) background during the
  // native tab transition on iOS 26.
  const contentStyle = { backgroundColor: theme.background };

  return (
    <NativeTabs tintColor={theme.tint}>
      <NativeTabs.Trigger name="index" contentStyle={contentStyle}>
        <NativeTabs.Trigger.Label>{t('tabs.home')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="optimizer" contentStyle={contentStyle}>
        <NativeTabs.Trigger.Label>{t('tabs.optimizer')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="chart.line.uptrend.xyaxis" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="history" contentStyle={contentStyle}>
        <NativeTabs.Trigger.Label>{t('tabs.history')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'clock', selected: 'clock.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="billing" contentStyle={contentStyle}>
        <NativeTabs.Trigger.Label>{t('tabs.billing')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'creditcard', selected: 'creditcard.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="academia" contentStyle={contentStyle}>
        <NativeTabs.Trigger.Label>{t('tabs.academia')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'graduationcap', selected: 'graduationcap.fill' }} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
