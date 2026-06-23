import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SocialSignIn } from '@/components/auth/social-sign-in';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translations';
import { authClient, useSession } from '@/lib/auth-client';

export default function OptimizerScreen() {
  const theme = useTheme();
  const { data: session, isPending } = useSession();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['bottom']} style={styles.safeArea}>
        {isPending ? (
          <ActivityIndicator color={theme.tint} />
        ) : session ? (
          <SignedInOptimizer userName={session.user.name || session.user.email} />
        ) : (
          <SocialSignIn />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

/**
 * Placeholder optimizer content shown once the user is authenticated. The
 * mean-variance optimization flow itself is the next milestone; for now this
 * confirms the session is wired and offers a way to sign out.
 */
function SignedInOptimizer({ userName }: { userName: string }) {
  const t = useTranslations();
  const theme = useTheme();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await authClient.signOut();
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <>
      <Ionicons name="trending-up" size={48} color={theme.tint} />
      <View style={styles.copy}>
        <ThemedText type="subtitle">{t('optimizer.comingSoon')}</ThemedText>
        <ThemedText type="default" themeColor="textSecondary" style={styles.description}>
          {t('optimizer.description')}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('auth.signedInAs')} {userName}
        </ThemedText>
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={isSigningOut}
        onPress={handleSignOut}
        style={({ pressed }) => [
          styles.signOut,
          { borderColor: theme.border },
          pressed && { backgroundColor: theme.backgroundSelected },
        ]}>
        {isSigningOut ? (
          <ActivityIndicator color={theme.text} />
        ) : (
          <ThemedText type="default">{t('auth.signOut')}</ThemedText>
        )}
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    padding: Spacing.four,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.four,
  },
  copy: {
    gap: Spacing.two,
    alignItems: 'center',
  },
  description: {
    textAlign: 'center',
    maxWidth: 320,
  },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
});
