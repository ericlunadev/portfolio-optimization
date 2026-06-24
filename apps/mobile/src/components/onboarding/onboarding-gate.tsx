import { ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useOnboardingProfile } from '@/hooks/use-onboarding';
import { useSession } from '@/lib/auth-client';

/**
 * Wraps the authenticated tab experience. Once a session exists but the profile
 * isn't complete (`completedAt == null`), the full-screen wizard replaces the
 * tabs (the parent Stack screen hides its header, so no tab bar shows). Signed-
 * out users fall straight through to `children`, where each screen's own
 * `AuthPanel` gate takes over.
 */
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const { data: session, isPending: sessionPending } = useSession();
  const hasUser = !!session?.user;

  const { data: profile, isLoading: profileLoading } = useOnboardingProfile(hasUser);

  // Signed out (or still resolving the session): let the per-screen auth gates decide.
  if (!hasUser) {
    return <>{children}</>;
  }

  // Authenticated but still loading the profile: avoid a flash of the tab shell.
  if (sessionPending || profileLoading || !profile) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView edges={['top', 'bottom']} style={styles.centered}>
          <ActivityIndicator color={theme.tint} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (!profile.completedAt) {
    return <OnboardingWizard initialProfile={profile} />;
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    padding: Spacing.four,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
