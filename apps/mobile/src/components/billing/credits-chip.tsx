import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useWallet } from '@/hooks/use-billing';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translations';

/** Compact wallet balance that links to the billing tab. */
export function CreditsChip() {
  const t = useTranslations();
  const theme = useTheme();
  const wallet = useWallet();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('billing.chipAria')}
      onPress={() => router.navigate('/billing')}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        pressed && { backgroundColor: theme.backgroundSelected },
      ]}>
      <Ionicons name="wallet-outline" size={16} color={theme.tint} />
      <ThemedText type="smallBold">
        {wallet.isLoading ? '…' : (wallet.data?.credits ?? 0)}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.four,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
  },
});
