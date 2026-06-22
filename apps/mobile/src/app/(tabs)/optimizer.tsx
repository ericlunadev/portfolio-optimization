import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translations';

export default function OptimizerScreen() {
  const t = useTranslations();
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['bottom']} style={styles.safeArea}>
        <Ionicons name="trending-up" size={48} color={theme.tint} />
        <View style={styles.copy}>
          <ThemedText type="subtitle">{t('optimizer.comingSoon')}</ThemedText>
          <ThemedText type="default" themeColor="textSecondary" style={styles.description}>
            {t('optimizer.description')}
          </ThemedText>
        </View>
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
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.four,
  },
  copy: {
    gap: Spacing.two,
    alignItems: 'center',
  },
  description: {
    textAlign: 'center',
    maxWidth: 320,
  },
});
