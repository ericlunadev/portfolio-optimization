/**
 * Station 1 — Macro / economic climate.
 *
 * Phase 1: climate selector (expansion/contraction/stagflation) driving the
 * label/description/mood and the leading-sector chips. All copy from
 * `academia.station1.*` and `academia.lessons.macro.*`.
 *
 * DEFERRED: the web's 3D rotating globe (three/@react-three/fiber) — replaced
 * here by a simple themed banner. A 2D world treatment could come in a later
 * phase.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translations';

import { getStation } from './lessons';
import { Chip, SelectorButton } from './primitives';
import { LessonBullets, StationFrame } from './station-frame';

type Climate = 'expansion' | 'contraction' | 'stagflation';

const CLIMATES: Climate[] = ['expansion', 'contraction', 'stagflation'];

export function StationMacro() {
  const t = useTranslations();
  const theme = useTheme();
  const station = getStation('macro');
  const [climate, setClimate] = useState<Climate>('expansion');

  const base = `academia.station1`;
  const winners = [
    t(`${base}.${climate}Winner1`),
    t(`${base}.${climate}Winner2`),
    t(`${base}.${climate}Winner3`),
  ];

  return (
    <StationFrame station={station}>
      {/* Static themed banner standing in for the 3D globe. */}
      <ThemedView type="backgroundSelected" style={styles.banner}>
        <ThemedText type="subtitle" style={[styles.globe, { color: theme.tint }]}>
          🌐
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.bannerCaption}>
          {t(`${base}.globeCaption`)}
        </ThemedText>
      </ThemedView>

      <View style={styles.section}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
          {t(`${base}.climateLabel`).toUpperCase()}
        </ThemedText>
        <View style={styles.selectorRow}>
          {CLIMATES.map((c) => (
            <SelectorButton
              key={c}
              label={t(`${base}.${c}Label`)}
              active={climate === c}
              onPress={() => setClimate(c)}
            />
          ))}
        </View>
      </View>

      <ThemedView type="background" style={styles.detail}>
        <View style={styles.detailHeader}>
          <ThemedText type="smallBold">{t(`${base}.${climate}Label`)}</ThemedText>
          <ThemedText type="small" style={{ color: theme.tint }}>
            {t(`${base}.${climate}Mood`)}
          </ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {t(`${base}.${climate}Description`)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
          {t(`${base}.leadingSectorsLabel`).toUpperCase()}
        </ThemedText>
        <View style={styles.chips}>
          {winners.map((w) => (
            <Chip key={w} label={w} active />
          ))}
        </View>
      </ThemedView>

      <LessonBullets stationKey={station.key} />
    </StationFrame>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: Spacing.three,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.two,
  },
  globe: {
    fontSize: 48,
    lineHeight: 56,
  },
  bannerCaption: {
    textAlign: 'center',
  },
  section: {
    gap: Spacing.two,
  },
  sectionLabel: {
    letterSpacing: 1.2,
  },
  selectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  detail: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
});
