/**
 * RN equivalent of the web's StationFrame: renders a station's index, label,
 * title, tagline (from `academia.lessons.<key>.*`) and its children.
 *
 * DEFERRED: the web's framer-motion scroll-linked opacity fade is dropped; a
 * plain vertical card is used instead (no animation in Phase 1).
 */
import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translations';

import { type StationMeta } from './lessons';

export function StationFrame({
  station,
  children,
}: {
  station: StationMeta;
  children: ReactNode;
}) {
  const t = useTranslations();
  const theme = useTheme();
  const base = `academia.lessons.${station.key}`;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.header}>
        <ThemedText type="title" style={[styles.index, { color: theme.tint }]}>
          {String(station.index).padStart(2, '0')}
        </ThemedText>
        <View style={styles.headerText}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
            {t(`${base}.label`).toUpperCase()}
          </ThemedText>
          <ThemedText type="subtitle" style={styles.title}>
            {t(`${base}.title`)}
          </ThemedText>
        </View>
      </View>

      <View style={[styles.tagline, { borderLeftColor: theme.tint }]}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.taglineText}>
          {t(`${base}.tagline`)}
        </ThemedText>
      </View>

      <ThemedText type="default" themeColor="textSecondary">
        {t(`${base}.summary`)}
      </ThemedText>

      {children}
    </ThemedView>
  );
}

/** Renders the three lesson bullets for a station. */
export function LessonBullets({ stationKey }: { stationKey: StationMeta['key'] }) {
  const t = useTranslations();
  const theme = useTheme();
  const base = `academia.lessons.${stationKey}`;

  return (
    <View style={styles.bullets}>
      {[1, 2, 3].map((n) => (
        <View key={n} style={styles.bulletRow}>
          <ThemedText type="small" style={{ color: theme.tint }}>
            →
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.bulletText}>
            {t(`${base}.bullet${n}`)}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  index: {
    fontSize: 44,
    lineHeight: 46,
  },
  headerText: {
    flex: 1,
    gap: Spacing.half,
  },
  label: {
    letterSpacing: 1.5,
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
  },
  tagline: {
    borderLeftWidth: 2,
    paddingLeft: Spacing.three,
  },
  taglineText: {
    fontStyle: 'italic',
  },
  bullets: {
    gap: Spacing.two,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  bulletText: {
    flex: 1,
  },
});
