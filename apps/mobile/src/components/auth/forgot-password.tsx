import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translations';
import { authClient } from '@/lib/auth-client';

type Props = {
  /** Returns to the sign-in form. */
  onBack: () => void;
};

type Status = 'idle' | 'sending' | 'sent' | 'error';

/**
 * Forgot-password view mirroring the web `forgot-password` page. Calls
 * `authClient.requestPasswordReset({ email })` — the server's `sendResetPassword`
 * hook builds the `FRONTEND_URL/auth/reset-password?token=...` link and emails it,
 * so the reset is completed in the web browser (mobile has no reset-token route).
 * No `redirectTo` is passed: the mobile app has no web origin to redirect to.
 *
 * Always shows the generic "if the account exists" success copy to avoid account
 * enumeration, matching the web flow.
 */
export function ForgotPassword({ onBack }: Props) {
  const t = useTranslations();
  const theme = useTheme();

  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');

  const handleSubmit = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setStatus('error');
      return;
    }
    setStatus('sending');
    try {
      const { error } = await authClient.requestPasswordReset({ email: trimmedEmail });
      setStatus(error ? 'error' : 'sent');
    } catch {
      setStatus('error');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.copy}>
        <ThemedText type="subtitle">{t('auth.forgotPasswordTitle')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('auth.forgotPasswordDescription')}
        </ThemedText>
      </View>

      {status === 'sent' ? (
        <ThemedText type="small" themeColor="positive">
          {t('auth.forgotPasswordSent')}
        </ThemedText>
      ) : (
        <View style={styles.form}>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder={t('auth.emailPlaceholder')}
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            editable={status !== 'sending'}
            onSubmitEditing={handleSubmit}
            style={[styles.input, { color: theme.text, borderColor: theme.border }]}
          />
          {status === 'error' ? (
            <ThemedText type="small" themeColor="negative">
              {t('auth.forgotPasswordError')}
            </ThemedText>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('auth.forgotPasswordSubmit')}
            disabled={status === 'sending'}
            onPress={handleSubmit}
            style={({ pressed }) => [
              styles.submit,
              { backgroundColor: theme.tint },
              (pressed || status === 'sending') && styles.submitBusy,
            ]}>
            {status === 'sending' ? (
              <ActivityIndicator color={theme.background} />
            ) : (
              <ThemedText type="smallBold" style={{ color: theme.background }}>
                {t('auth.forgotPasswordSubmit')}
              </ThemedText>
            )}
          </Pressable>
        </View>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('auth.backToSignIn')}
        onPress={onBack}
        hitSlop={Spacing.two}
        style={styles.back}>
        <ThemedText type="small" themeColor="tint">
          {t('auth.backToSignIn')}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  copy: {
    gap: Spacing.two,
  },
  form: {
    gap: Spacing.two,
  },
  input: {
    fontSize: 16,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.three,
  },
  submit: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  submitBusy: {
    opacity: 0.7,
  },
  back: {
    alignSelf: 'center',
    paddingVertical: Spacing.one,
  },
});
