import { useQuery } from '@tanstack/react-query';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LocaleSwitcher } from '@/components/locale-switcher';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translations';
import { getHealth } from '@/lib/api/health';

export default function HomeScreen() {
  const t = useTranslations();
  const theme = useTheme();

  const health = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
  });

  const statusText = health.isLoading
    ? t('home.apiChecking')
    : health.isError
      ? t('home.apiOffline')
      : t('home.apiOnline');

  const statusColor = health.isLoading
    ? theme.textSecondary
    : health.isError
      ? theme.negative
      : theme.positive;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <View style={styles.topBar}>
          <LocaleSwitcher />
        </View>
        <View style={styles.hero}>
          <ThemedText type="title" style={styles.title}>
            {t('home.title')}
          </ThemedText>
          <ThemedText type="default" themeColor="textSecondary" style={styles.subtitle}>
            {t('home.subtitle')}
          </ThemedText>
        </View>

        <ThemedView type="backgroundElement" style={styles.statusCard}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {t('home.apiStatusLabel')}
          </ThemedText>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <ThemedText type="default" style={{ color: statusColor }}>
              {statusText}
            </ThemedText>
          </View>
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    padding: Spacing.four,
    gap: Spacing.four,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.three,
  },
  title: {
    fontSize: 36,
    lineHeight: 42,
  },
  subtitle: {
    maxWidth: 320,
  },
  statusCard: {
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
