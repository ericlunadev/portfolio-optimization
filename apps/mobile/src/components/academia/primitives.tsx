/**
 * Lightweight, dependency-free React-Native primitives for the Academia
 * lessons. These stand in for the web's SVG/framer-motion visuals (donut,
 * gauges, sector wheel, correlation heatmap, efficient frontier).
 *
 * DEFERRED to a future phase: the real SVG charts (react-native-svg) and the
 * 3D globe (expo-gl/expo-three) — see the screen at src/app/(tabs)/academia.tsx.
 * Everything here is a static, lightweight approximation built from flex Views.
 */
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** A labeled horizontal bar: width is `value`% of the track. */
export function StatBar({
  label,
  value,
  valueLabel,
  color,
}: {
  label: string;
  value: number;
  valueLabel?: string;
  color?: string;
}) {
  const theme = useTheme();
  const barColor = color ?? theme.tint;
  const pct = Math.max(0, Math.min(100, value));

  return (
    <View style={styles.barRow}>
      <View style={styles.barHeader}>
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
        {valueLabel ? (
          <ThemedText type="smallBold" style={{ color: barColor }}>
            {valueLabel}
          </ThemedText>
        ) : null}
      </View>
      <View style={[styles.barTrack, { backgroundColor: theme.backgroundSelected }]}>
        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: barColor }]} />
      </View>
    </View>
  );
}

/** A small rounded pill, optionally highlighted (e.g. a leading sector). */
export function Chip({ label, active }: { label: string; active?: boolean }) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.chip,
        {
          borderColor: active ? theme.tint : theme.border,
          backgroundColor: active ? theme.backgroundSelected : 'transparent',
        },
      ]}>
      <ThemedText type="small" themeColor={active ? 'tint' : 'textSecondary'}>
        {label}
      </ThemedText>
    </View>
  );
}

/** A selectable button used by the per-station selectors. */
export function SelectorButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[
        styles.selector,
        {
          borderColor: active ? theme.tint : theme.border,
          backgroundColor: active ? theme.backgroundSelected : theme.backgroundElement,
        },
      ]}>
      <ThemedText type="smallBold" themeColor={active ? 'tint' : 'textSecondary'}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  barRow: {
    gap: Spacing.one,
  },
  barHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  barTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  selector: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
