import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { SUPPORTED_LOCALES } from '@/i18n';
import { useLocale } from '@/providers/locale-provider';

/**
 * Compact segmented control to switch between the supported locales. Designed
 * to sit in the tab header (`headerRight`); the choice persists via
 * `LocaleProvider`.
 */
export function LocaleSwitcher() {
  const theme = useTheme();
  const { locale, setLocale } = useLocale();

  return (
    <View style={[styles.container, { borderColor: theme.border }]}>
      {SUPPORTED_LOCALES.map((option) => {
        const selected = option === locale;
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={option.toUpperCase()}
            onPress={() => setLocale(option)}
            style={[styles.option, selected && { backgroundColor: theme.tint }]}>
            <ThemedText
              type="smallBold"
              style={selected ? styles.selectedLabel : { color: theme.textSecondary }}>
              {option.toUpperCase()}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    overflow: 'hidden',
    marginRight: Spacing.three,
  },
  option: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
  },
  selectedLabel: {
    color: '#ffffff',
  },
});
