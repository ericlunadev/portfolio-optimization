import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthPanel } from '@/components/auth/auth-panel';
import { AdvisorCta } from '@/components/billing/advisor-cta';
import { CreditsChip } from '@/components/billing/credits-chip';
import { OptimizationResults } from '@/components/optimizer/optimization-results';
import { OptimizerForm } from '@/components/optimizer/optimizer-form';
import { SaveToHistory } from '@/components/optimizer/save-to-history';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useRefreshBilling } from '@/hooks/use-billing';
import { useOptimizerForm } from '@/hooks/use-optimizer-form';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translations';
import { authClient, useSession } from '@/lib/auth-client';
import { ApiError } from '@/lib/api/client';
import { optimizePortfolio } from '@/lib/api/optimization';

export default function OptimizerScreen() {
  const theme = useTheme();
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView edges={['bottom']} style={styles.centered}>
          <ActivityIndicator color={theme.tint} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (!session) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView edges={['bottom']} style={styles.flex}>
          <AuthPanel />
        </SafeAreaView>
      </ThemedView>
    );
  }

  return <SignedInOptimizer userName={session.user.name || session.user.email} />;
}

function SignedInOptimizer({ userName }: { userName: string }) {
  const t = useTranslations();
  const theme = useTheme();
  const form = useOptimizerForm();
  const [view, setView] = useState<'form' | 'results'>('form');
  const [isSigningOut, setIsSigningOut] = useState(false);

  const refreshBilling = useRefreshBilling();
  const optimize = useMutation({ mutationFn: optimizePortfolio });

  // A successful run spent 1 credit; a 402 means the wallet is empty.
  const outOfCredits = optimize.error instanceof ApiError && optimize.error.status === 402;

  const handleSubmit = () => {
    optimize.mutate(form.buildRequest(), {
      onSuccess: () => {
        setView('results');
        refreshBilling();
      },
    });
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await authClient.signOut();
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['bottom']} style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag">
          <View style={styles.header}>
            <View style={styles.headerText}>
              <ThemedText type="title" style={styles.title}>
                {t('optimizer.title')}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t('auth.signedInAs')} {userName}
              </ThemedText>
            </View>
            <View style={styles.headerActions}>
              <CreditsChip />
              <Pressable
                accessibilityRole="button"
                disabled={isSigningOut}
                onPress={handleSignOut}
                hitSlop={Spacing.two}>
                {isSigningOut ? (
                  <ActivityIndicator color={theme.textSecondary} />
                ) : (
                  <ThemedText type="link" themeColor="tint">
                    {t('auth.signOut')}
                  </ThemedText>
                )}
              </Pressable>
            </View>
          </View>

          {view === 'results' && optimize.data ? (
            <View style={styles.resultsWrapper}>
              <View style={styles.resultsHeader}>
                <ThemedText type="subtitle">{t('optimizer.resultsTitle')}</ThemedText>
                <Pressable accessibilityRole="button" onPress={() => setView('form')} hitSlop={Spacing.two}>
                  <ThemedText type="link" themeColor="tint">
                    {t('optimizer.edit')}
                  </ThemedText>
                </Pressable>
              </View>
              <OptimizationResults result={optimize.data} />
              {optimize.variables ? (
                <SaveToHistory params={optimize.variables} result={optimize.data} />
              ) : null}
              <AdvisorCta />
            </View>
          ) : (
            <View style={styles.formWrapper}>
              {outOfCredits ? (
                <ThemedView type="backgroundElement" style={styles.outOfCredits}>
                  <ThemedText type="smallBold">{t('billing.outOfCreditsTitle')}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('billing.outOfCreditsBody')}
                  </ThemedText>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.navigate('/billing')}
                    hitSlop={Spacing.two}>
                    <ThemedText type="link" themeColor="tint">
                      {t('billing.outOfCreditsCta')}
                    </ThemedText>
                  </Pressable>
                </ThemedView>
              ) : optimize.isError ? (
                <ThemedText type="small" themeColor="negative">
                  {t('optimizer.error')}
                </ThemedText>
              ) : null}
              <OptimizerForm form={form} isSubmitting={optimize.isPending} onSubmit={handleSubmit} />
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  centered: {
    flex: 1,
    padding: Spacing.four,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  headerText: {
    flex: 1,
    gap: Spacing.one,
  },
  headerActions: {
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  title: {
    fontSize: 32,
    lineHeight: 38,
  },
  formWrapper: {
    gap: Spacing.three,
  },
  outOfCredits: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  resultsWrapper: {
    gap: Spacing.four,
  },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
});
