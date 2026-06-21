import { Link, Stack } from 'expo-router';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTranslations } from '@/hooks/use-translations';

export default function NotFoundScreen() {
  const t = useTranslations();

  return (
    <>
      <Stack.Screen options={{ title: t('notFound.title') }} />
      <ThemedView style={styles.container}>
        <ThemedText type="subtitle">{t('notFound.title')}</ThemedText>
        <Link href="/" style={styles.link}>
          <ThemedText type="linkPrimary">{t('notFound.goHome')}</ThemedText>
        </Link>
      </ThemedView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  link: {
    paddingVertical: Spacing.three,
  },
});
