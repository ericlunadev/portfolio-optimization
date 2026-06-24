import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translations';
import { authClient, type SocialProvider } from '@/lib/auth-client';

type ProviderConfig = {
  provider: SocialProvider;
  icon: keyof typeof Ionicons.glyphMap;
  labelKey: string;
};

const PROVIDERS: ProviderConfig[] = [
  { provider: 'google', icon: 'logo-google', labelKey: 'auth.continueWithGoogle' },
  { provider: 'github', icon: 'logo-github', labelKey: 'auth.continueWithGithub' },
  { provider: 'microsoft', icon: 'logo-microsoft', labelKey: 'auth.continueWithMicrosoft' },
];

/**
 * Social sign-in buttons (Google / GitHub / Microsoft). Sign-in opens the system
 * browser via the BetterAuth Expo plugin and redirects back into the app, after
 * which `useSession()` updates reactively and the caller reveals gated content.
 *
 * The shared "Sign in" header lives in `AuthPanel`, which composes these buttons
 * below the email/password form — so this component renders only the providers.
 */
export function SocialSignIn() {
  const t = useTranslations();
  const theme = useTheme();
  const [pendingProvider, setPendingProvider] = useState<SocialProvider | null>(null);
  const [hasError, setHasError] = useState(false);

  const signInWith = async (provider: SocialProvider) => {
    setPendingProvider(provider);
    setHasError(false);
    try {
      const { error } = await authClient.signIn.social({
        provider,
        // Relative path; the Expo plugin turns it into a deep link back here.
        callbackURL: '/optimizer',
      });
      if (error) setHasError(true);
    } catch {
      setHasError(true);
    } finally {
      setPendingProvider(null);
    }
  };

  const isBusy = pendingProvider !== null;

  return (
    <View style={styles.container}>
      <View style={styles.buttons}>
        {PROVIDERS.map(({ provider, icon, labelKey }) => {
          const isPending = pendingProvider === provider;
          return (
            <Pressable
              key={provider}
              accessibilityRole="button"
              disabled={isBusy}
              onPress={() => signInWith(provider)}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                (pressed || isPending) && { backgroundColor: theme.backgroundSelected },
                isBusy && !isPending && styles.buttonDimmed,
              ]}>
              {isPending ? (
                <ActivityIndicator color={theme.text} />
              ) : (
                <Ionicons name={icon} size={20} color={theme.text} />
              )}
              <ThemedText type="default">
                {isPending ? t('auth.signingIn') : t(labelKey)}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {hasError ? (
        <ThemedText type="small" themeColor="negative" style={styles.error}>
          {t('auth.error')}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: Spacing.four,
  },
  buttons: {
    gap: Spacing.two,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  buttonDimmed: {
    opacity: 0.5,
  },
  error: {
    textAlign: 'center',
  },
});
