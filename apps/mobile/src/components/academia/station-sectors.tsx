/**
 * Station 3 — Sector rotation.
 *
 * Phase 1: business-cycle phase selector (early/mid/late/recession) + the
 * leading sectors for that phase rendered as chips, plus the phase description.
 * `PHASE_LEADERS` ported from the web Station; the full sector list is shown as
 * dimmed chips with the leaders highlighted.
 *
 * DEFERRED: the SVG rotating sector wheel.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTranslations } from '@/hooks/use-translations';

import { getStation } from './lessons';
import { Chip, SelectorButton } from './primitives';
import { LessonBullets, StationFrame } from './station-frame';

type Phase = 'early' | 'mid' | 'late' | 'recession';

const PHASES: Phase[] = ['early', 'mid', 'late', 'recession'];

// Sector keys that lead in each phase (port of the web PHASE_LEADERS).
const PHASE_LEADERS: Record<Phase, string[]> = {
  early: ['sectorTechnology', 'sectorDiscretionary', 'sectorFinancials'],
  mid: ['sectorIndustrials', 'sectorTechnology', 'sectorMaterials'],
  late: ['sectorEnergy', 'sectorMaterials', 'sectorStaples'],
  recession: ['sectorStaples', 'sectorHealthcare', 'sectorUtilities'],
};

const SECTOR_KEYS = [
  'sectorTechnology',
  'sectorDiscretionary',
  'sectorFinancials',
  'sectorIndustrials',
  'sectorMaterials',
  'sectorEnergy',
  'sectorStaples',
  'sectorHealthcare',
  'sectorUtilities',
  'sectorRealEstate',
  'sectorTelecom',
];

export function StationSectors() {
  const t = useTranslations();
  const station = getStation('sectors');
  const [phase, setPhase] = useState<Phase>('mid');

  const base = `academia.station3`;
  const leaders = PHASE_LEADERS[phase];

  return (
    <StationFrame station={station}>
      <View style={styles.section}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
          {t(`${base}.phaseSelectorLabel`).toUpperCase()}
        </ThemedText>
        <View style={styles.selectorGrid}>
          {PHASES.map((p) => (
            <SelectorButton
              key={p}
              label={t(`${base}.${p}Label`)}
              active={phase === p}
              onPress={() => setPhase(p)}
            />
          ))}
        </View>
      </View>

      <ThemedView type="background" style={styles.detail}>
        <ThemedText type="small" themeColor="textSecondary">
          {t(`${base}.${phase}Description`)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
          {t(`${base}.leadingSectorsLabel`).toUpperCase()}
        </ThemedText>
        <View style={styles.chips}>
          {SECTOR_KEYS.map((key) => (
            <Chip key={key} label={t(`${base}.${key}`)} active={leaders.includes(key)} />
          ))}
        </View>
      </ThemedView>

      <LessonBullets stationKey={station.key} />
    </StationFrame>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
  sectionLabel: {
    letterSpacing: 1.2,
  },
  selectorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  detail: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
});
