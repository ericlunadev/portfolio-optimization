import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Visual chip shared by the single- and multi-select groups. */
function Chip({
  label,
  active,
  onPress,
  accessibilityRole,
  accessibilityState,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  accessibilityRole: 'radio' | 'checkbox';
  accessibilityState: { selected?: boolean; checked?: boolean };
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityState}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: active ? theme.tint : theme.border,
          backgroundColor: active ? theme.backgroundSelected : theme.backgroundElement,
        },
        pressed && styles.chipPressed,
      ]}>
      <ThemedText type="small" themeColor={active ? 'tint' : 'textSecondary'}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

/** Single-select chip group (radiogroup semantics). */
export function SingleSelectChips<T extends string>({
  options,
  value,
  onChange,
  labelFor,
}: {
  options: readonly T[];
  value: T | '';
  onChange: (next: T) => void;
  labelFor: (option: T) => string;
}) {
  return (
    <View accessibilityRole="radiogroup" style={styles.group}>
      {options.map((option) => (
        <Chip
          key={option}
          label={labelFor(option)}
          active={option === value}
          onPress={() => onChange(option)}
          accessibilityRole="radio"
          accessibilityState={{ selected: option === value }}
        />
      ))}
    </View>
  );
}

/** Multi-select chip group (checkbox semantics). */
export function MultiSelectChips<T extends string>({
  options,
  selected,
  onToggle,
  labelFor,
}: {
  options: readonly T[];
  selected: readonly T[];
  onToggle: (option: T) => void;
  labelFor: (option: T) => string;
}) {
  return (
    <View style={styles.group}>
      {options.map((option) => {
        const active = selected.includes(option);
        return (
          <Chip
            key={option}
            label={labelFor(option)}
            active={active}
            onPress={() => onToggle(option)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: active }}
          />
        );
      })}
    </View>
  );
}

/** Returns `arr` with `value` toggled in or out. */
export function toggleValue<T>(arr: readonly T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((item) => item !== value) : [...arr, value];
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  chipPressed: {
    opacity: 0.7,
  },
});
