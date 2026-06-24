import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthPanel } from '@/components/auth/auth-panel';
import { LedgerList } from '@/components/billing/ledger-list';
import { PackagePicker } from '@/components/billing/package-picker';
import { WalletCard } from '@/components/billing/wallet-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translations';
import { useSession } from '@/lib/auth-client';

export default function BillingScreen() {
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

  return <SignedInBilling />;
}

function SignedInBilling() {
  const t = useTranslations();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['bottom']} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.heading}>
            <ThemedText type="title" style={styles.title}>
              {t('billing.pageTitle')}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('billing.pageSubtitle')}
            </ThemedText>
          </View>

          <WalletCard />
          <PackagePicker />
          <LedgerList />
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
  heading: {
    gap: Spacing.one,
  },
  title: {
    fontSize: 32,
    lineHeight: 38,
  },
});
