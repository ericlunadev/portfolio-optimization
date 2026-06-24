import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translations';
import { authClient } from '@/lib/auth-client';

/** Matches the BetterAuth default and web's `minLength={8}` on the password input. */
const MIN_PASSWORD_LENGTH = 8;

type Mode = 'signin' | 'signup';

type Props = {
  mode: Mode;
  /** Toggles between the sign-in and create-account variants. */
  onToggleMode: () => void;
  /** Reveals the forgot-password view (shown under the sign-in variant only). */
  onForgotPassword: () => void;
};

/**
 * Email/password form mirroring the web `AuthModal` submit logic. Calls
 * `authClient.signIn.email` / `authClient.signUp.email` — both return `{ error }`
 * rather than throwing, so the result is checked explicitly. On success the Expo
 * client persists the session and `useSession()` updates reactively, so the gated
 * screen re-renders into its signed-in content (no manual navigation needed).
 *
 * Sign-up returns a session immediately (the API does not set
 * `requireEmailVerification`); a verification email is sent in the background, so
 * a soft, non-blocking note is shown after a successful sign-up.
 */
export function EmailPasswordForm({ mode, onToggleMode, onForgotPassword }: Props) {
  const t = useTranslations();
  const theme = useTheme();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showVerifyNote, setShowVerifyNote] = useState(false);

  const isSignUp = mode === 'signup';

  const handleSubmit = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError(t('auth.errorEmptyFields'));
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t('auth.errorPasswordTooShort'));
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      if (isSignUp) {
        const { error: signUpError } = await authClient.signUp.email({
          email: trimmedEmail,
          password,
          name: name.trim() || trimmedEmail,
        });
        if (signUpError) {
          setError(signUpError.message || t('auth.errorCreate'));
          return;
        }
        // Sign-up auto-signs-in; surface a soft note while the session settles.
        setShowVerifyNote(true);
      } else {
        const { error: signInError } = await authClient.signIn.email({
          email: trimmedEmail,
          password,
        });
        if (signInError) {
          setError(signInError.message || t('auth.errorInvalidCredentials'));
          return;
        }
      }
    } catch {
      setError(isSignUp ? t('auth.errorCreate') : t('auth.errorInvalidCredentials'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputStyle = [styles.input, { color: theme.text, borderColor: theme.border }];

  return (
    <View style={styles.container}>
      {isSignUp ? (
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t('auth.namePlaceholder')}
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          editable={!isSubmitting}
          style={inputStyle}
        />
      ) : null}

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
        editable={!isSubmitting}
        style={inputStyle}
      />

      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder={t('auth.passwordPlaceholder')}
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        autoComplete={isSignUp ? 'new-password' : 'password'}
        textContentType={isSignUp ? 'newPassword' : 'password'}
        editable={!isSubmitting}
        onSubmitEditing={handleSubmit}
        style={inputStyle}
      />

      {!isSignUp ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('auth.forgotPassword')}
          onPress={onForgotPassword}
          hitSlop={Spacing.two}
          style={styles.forgotRow}>
          <ThemedText type="small" themeColor="tint">
            {t('auth.forgotPassword')}
          </ThemedText>
        </Pressable>
      ) : null}

      {error ? (
        <ThemedText type="small" themeColor="negative">
          {error}
        </ThemedText>
      ) : null}

      {showVerifyNote ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('auth.verifyEmailNote')}
        </ThemedText>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isSignUp ? t('auth.submitSignUp') : t('auth.submitSignIn')}
        disabled={isSubmitting}
        onPress={handleSubmit}
        style={({ pressed }) => [
          styles.submit,
          { backgroundColor: theme.tint },
          (pressed || isSubmitting) && styles.submitBusy,
        ]}>
        {isSubmitting ? (
          <ActivityIndicator color={theme.background} />
        ) : (
          <ThemedText type="smallBold" style={{ color: theme.background }}>
            {isSignUp ? t('auth.submitSignUp') : t('auth.submitSignIn')}
          </ThemedText>
        )}
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isSignUp ? t('auth.signInTab') : t('auth.createAccountTab')}
        onPress={() => {
          setError(null);
          setShowVerifyNote(false);
          onToggleMode();
        }}
        hitSlop={Spacing.two}
        style={styles.toggle}>
        <ThemedText type="small" themeColor="tint">
          {isSignUp ? t('auth.signInTab') : t('auth.createAccountTab')}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  input: {
    fontSize: 16,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.three,
  },
  forgotRow: {
    alignSelf: 'flex-end',
  },
  submit: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    marginTop: Spacing.one,
  },
  submitBusy: {
    opacity: 0.7,
  },
  toggle: {
    alignSelf: 'center',
    paddingVertical: Spacing.one,
  },
});
