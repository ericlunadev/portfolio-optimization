import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translations';
import type { OptimizationStrategy } from '@/lib/api/optimization';
import { STRATEGIES } from '@/lib/optimizer/strategies';

type StrategyPickerProps = {
  value: OptimizationStrategy;
  onChange: (strategy: OptimizationStrategy) => void;
};

/** Selectable list of optimization strategies with labels + descriptions. */
export function StrategyPicker({ value, onChange }: StrategyPickerProps) {
  const t = useTranslations();
  const theme = useTheme();

  return (
    <View style={styles.container}>
      {STRATEGIES.map(({ value: strategy }) => {
        const selected = strategy === value;
        return (
          <Pressable
            key={strategy}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(strategy)}
            style={({ pressed }) => [
              styles.option,
              {
                borderColor: selected ? theme.tint : theme.border,
                backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement,
              },
              pressed && { opacity: 0.85 },
            ]}>
            <View style={styles.optionText}>
              <ThemedText type="smallBold">{t(`optimizer.strategies.${strategy}.label`)}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t(`optimizer.strategies.${strategy}.description`)}
              </ThemedText>
            </View>
            {selected ? <Ionicons name="checkmark-circle" size={20} color={theme.tint} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  optionText: {
    flex: 1,
    gap: 2,
  },
});
