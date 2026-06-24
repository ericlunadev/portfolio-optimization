import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { EmailPasswordForm } from '@/components/auth/email-password-form';
import { ForgotPassword } from '@/components/auth/forgot-password';
import { SocialSignIn } from '@/components/auth/social-sign-in';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translations';

type PanelView = 'signin' | 'signup' | 'forgot';

/**
 * Combined auth panel rendered by every gated screen. Stacks the
 * email/password form above a divider and the social provider buttons, and owns
 * the shared header plus the sign-in / sign-up / forgot-password view state.
 *
 * Wrapped in a KeyboardAvoidingView + ScrollView so the inputs stay visible when
 * the keyboard opens on small devices; the gated screens center this panel.
 */
export function AuthPanel() {
  const t = useTranslations();
  const theme = useTheme();
  const [view, setView] = useState<PanelView>('signin');

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}>
        <View style={styles.panel}>
          {view === 'forgot' ? (
            <ForgotPassword onBack={() => setView('signin')} />
          ) : (
            <>
              <View style={styles.copy}>
                <ThemedText type="subtitle">{t('auth.title')}</ThemedText>
                <ThemedText type="default" themeColor="textSecondary" style={styles.subtitle}>
                  {t('auth.subtitle')}
                </ThemedText>
              </View>

              <EmailPasswordForm
                mode={view === 'signup' ? 'signup' : 'signin'}
                onToggleMode={() => setView(view === 'signup' ? 'signin' : 'signup')}
                onForgotPassword={() => setView('forgot')}
              />

              <View style={styles.divider}>
                <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
                <ThemedText type="small" themeColor="textSecondary">
                  {t('auth.dividerOr')}
                </ThemedText>
                <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
              </View>

              <SocialSignIn />
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    width: '100%',
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.four,
  },
  panel: {
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
    gap: Spacing.four,
  },
  copy: {
    gap: Spacing.two,
    alignItems: 'center',
  },
  subtitle: {
    textAlign: 'center',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
});
