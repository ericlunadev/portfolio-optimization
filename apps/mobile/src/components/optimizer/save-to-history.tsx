import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useSaveSimulation } from '@/hooks/use-simulations';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translations';
import type { OptimizationResult } from '@/lib/api/optimization';
import type { SimulationParams } from '@/lib/api/simulations';

type SaveToHistoryProps = {
  params: SimulationParams;
  result: OptimizationResult;
};

/**
 * Persists the current optimizer run to the user's saved history. Resets itself
 * whenever a new `result` comes in so a fresh run can be saved independently.
 */
export function SaveToHistory({ params, result }: SaveToHistoryProps) {
  const t = useTranslations();
  const theme = useTheme();
  const save = useSaveSimulation();

  useEffect(() => {
    save.reset();
    // Reset only when a new result arrives, not when the mutation object changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const savedId = save.data?.id;

  if (savedId) {
    return (
      <View style={styles.row}>
        <Ionicons name="checkmark-circle" size={18} color={theme.positive} />
        <ThemedText type="smallBold" themeColor="positive">
          {t('history.saved')}
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/simulation/[id]', params: { id: savedId } })}
          hitSlop={Spacing.two}>
          <ThemedText type="link" themeColor="tint">
            {t('history.viewSaved')}
          </ThemedText>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <Pressable
        accessibilityRole="button"
        disabled={save.isPending}
        onPress={() => save.mutate({ params, result })}
        style={[styles.button, { borderColor: theme.tint }]}>
        {save.isPending ? (
          <ActivityIndicator color={theme.tint} size="small" />
        ) : (
          <Ionicons name="bookmark-outline" size={16} color={theme.tint} />
        )}
        <ThemedText type="smallBold" themeColor="tint">
          {save.isPending ? t('history.saving') : t('history.saveAction')}
        </ThemedText>
      </Pressable>
      {save.isError ? (
        <ThemedText type="small" themeColor="negative">
          {t('history.saveError')}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: Spacing.two,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
