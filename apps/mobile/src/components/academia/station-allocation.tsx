/**
 * Station 2 — Risk profile / asset allocation.
 *
 * Phase 1: profile selector (conservative/moderate/aggressive) + stocks/bonds
 * allocation as labeled horizontal bars + the simulated max-drawdown number.
 * Illustrative `PROFILES` constant ported from the web Station component.
 *
 * DEFERRED: the SVG donut and the animated drawdown curve.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translations';

import { getStation } from './lessons';
import { SelectorButton, StatBar } from './primitives';
import { LessonBullets, StationFrame } from './station-frame';

type Profile = 'conservative' | 'moderate' | 'aggressive';

// Illustrative mix + worst-case drawdown per profile (from the web Station).
const PROFILES: Record<Profile, { stocks: number; bonds: number; maxDrawdown: number }> = {
  conservative: { stocks: 20, bonds: 80, maxDrawdown: -8 },
  moderate: { stocks: 60, bonds: 40, maxDrawdown: -20 },
  aggressive: { stocks: 90, bonds: 10, maxDrawdown: -38 },
};

const ORDER: Profile[] = ['conservative', 'moderate', 'aggressive'];

export function StationAllocation() {
  const t = useTranslations();
  const theme = useTheme();
  const station = getStation('allocation');
  const [profile, setProfile] = useState<Profile>('moderate');
  const data = PROFILES[profile];

  const base = `academia.station2`;

  return (
    <StationFrame station={station}>
      <View style={styles.selectorColumn}>
        {ORDER.map((p) => (
          <SelectorButton
            key={p}
            label={`${t(`${base}.${p}Label`)} · ${PROFILES[p].stocks}/${PROFILES[p].bonds}`}
            active={profile === p}
            onPress={() => setProfile(p)}
          />
        ))}
      </View>

      <ThemedView type="background" style={styles.detail}>
        <ThemedText type="small" themeColor="textSecondary">
          {t(`${base}.${profile}Description`)}
        </ThemedText>
        <StatBar
          label={t(`${base}.stocksLabel`)}
          value={data.stocks}
          valueLabel={`${data.stocks}%`}
          color={theme.tint}
        />
        <StatBar
          label={t(`${base}.bondsLabel`)}
          value={data.bonds}
          valueLabel={`${data.bonds}%`}
          color={theme.textSecondary}
        />
        <View style={styles.drawdownRow}>
          <ThemedText type="small" themeColor="textSecondary">
            {t(`${base}.maxDrawdownLabel`)}
          </ThemedText>
          <ThemedText type="smallBold" themeColor="negative">
            {data.maxDrawdown}%
          </ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={styles.caption}>
          {t(`${base}.drawdownCaption`)}
        </ThemedText>
      </ThemedView>

      <LessonBullets stationKey={station.key} />
    </StationFrame>
  );
}

const styles = StyleSheet.create({
  selectorColumn: {
    gap: Spacing.two,
  },
  detail: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  drawdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  caption: {
    fontStyle: 'italic',
  },
});
