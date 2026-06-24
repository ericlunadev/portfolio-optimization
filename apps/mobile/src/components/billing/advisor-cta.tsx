import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useBookAdvisorCall } from '@/hooks/use-billing';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translations';
import { ApiError } from '@/lib/api/client';
import { randomId } from '@/lib/id';

/**
 * "Book a 30-min call with a financial advisor" card. Booking spends credits
 * server-side (`POST /api/billing/advisor-call`); on success we open the Cal.com
 * booking page in the in-app browser. A 402 means the wallet can't cover it, so
 * we point the user at the billing tab.
 */
export function AdvisorCta() {
  const t = useTranslations();
  const theme = useTheme();
  const book = useBookAdvisorCall();

  const insufficient = book.error instanceof ApiError && book.error.status === 402;
  const otherError = book.isError && !insufficient;

  const handleBook = () => {
    book.mutate(randomId(), {
      onSuccess: async ({ bookingUrl }) => {
        await WebBrowser.openBrowserAsync(bookingUrl);
      },
    });
  };

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="call-outline" size={22} color={theme.tint} />
        <View style={styles.headerText}>
          <ThemedText type="smallBold">{t('billing.advisorTitle')}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('billing.advisorSubtitle')}
          </ThemedText>
        </View>
      </View>

      {insufficient ? (
        <View style={styles.feedback}>
          <ThemedText type="small" themeColor="negative">
            {t('billing.advisorInsufficient')}
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.navigate('/billing')}
            hitSlop={Spacing.two}>
            <ThemedText type="link" themeColor="tint">
              {t('billing.outOfCreditsCta')}
            </ThemedText>
          </Pressable>
        </View>
      ) : null}

      {otherError ? (
        <ThemedText type="small" themeColor="negative">
          {t('billing.advisorError')}
        </ThemedText>
      ) : null}

      <Pressable
        accessibilityRole="button"
        disabled={book.isPending}
        onPress={handleBook}
        style={({ pressed }) => [
          styles.button,
          { borderColor: theme.tint },
          pressed && { backgroundColor: theme.backgroundSelected },
          book.isPending && styles.buttonDisabled,
        ]}>
        {book.isPending ? (
          <ActivityIndicator color={theme.tint} />
        ) : (
          <ThemedText type="smallBold" themeColor="tint">
            {t('billing.advisorButton')}
          </ThemedText>
        )}
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  headerText: {
    flex: 1,
    gap: Spacing.half,
  },
  feedback: {
    gap: Spacing.one,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
