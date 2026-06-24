import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useWallet } from '@/hooks/use-billing';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translations';

/** Shows the user's current credit balance. */
export function WalletCard() {
  const t = useTranslations();
  const theme = useTheme();
  const wallet = useWallet();

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {t('billing.walletLabel').toUpperCase()}
      </ThemedText>
      {wallet.isLoading ? (
        <ActivityIndicator color={theme.tint} style={styles.loader} />
      ) : (
        <View style={styles.balanceRow}>
          <ThemedText type="title" style={styles.balance}>
            {wallet.data?.credits ?? 0}
          </ThemedText>
          <ThemedText type="default" themeColor="textSecondary">
            {t('billing.creditsUnit')}
          </ThemedText>
        </View>
      )}
      <ThemedText type="small" themeColor="textSecondary">
        {t('billing.walletHint')}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  loader: {
    alignSelf: 'flex-start',
    marginVertical: Spacing.two,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  balance: {
    fontSize: 44,
    lineHeight: 48,
  },
});
