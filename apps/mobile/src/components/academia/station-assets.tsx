/**
 * Station 4 — Asset analysis (the dual filter).
 *
 * Phase 1: ALPHA/BETA/DELTA selector + fundamental scores (moat/valuation/
 * balance) as labeled progress bars + technical trend/RSI text + the dual-filter
 * verdict. `CANDIDATES` and the pass/fail scoring logic are ported from the web
 * Station so the verdict stays meaningful.
 *
 * DEFERRED: the SVG price chart, and the web InfoTooltip (candidate descriptions
 * are shown inline instead).
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

interface Candidate {
  ticker: string;
  moat: number;
  valuation: number;
  balance: number;
  trend: 'up' | 'down' | 'sideways';
  rsi: number;
}

// Illustrative candidates (port of the web CANDIDATES const).
const CANDIDATES: Candidate[] = [
  { ticker: 'ALPHA', moat: 82, valuation: 55, balance: 75, trend: 'up', rsi: 58 },
  { ticker: 'BETA', moat: 70, valuation: 28, balance: 68, trend: 'up', rsi: 78 },
  { ticker: 'DELTA', moat: 35, valuation: 82, balance: 42, trend: 'down', rsi: 32 },
];

const TREND_KEY = { up: 'trendUp', down: 'trendDown', sideways: 'trendSideways' } as const;

export function StationAssets() {
  const t = useTranslations();
  const theme = useTheme();
  const station = getStation('assets');
  const [active, setActive] = useState(CANDIDATES[0].ticker);
  const candidate = CANDIDATES.find((c) => c.ticker === active) ?? CANDIDATES[0];

  const base = `academia.station4`;

  const fundamentalScore = Math.round(
    (candidate.moat + candidate.valuation + candidate.balance) / 3,
  );
  const technicalScore = Math.round(
    candidate.trend === 'up'
      ? (100 - Math.abs(candidate.rsi - 55)) * 0.9
      : candidate.trend === 'down'
        ? 25
        : 50,
  );
  const passesFundamental = fundamentalScore >= 60;
  const passesTechnical = technicalScore >= 55;
  const passesBoth = passesFundamental && passesTechnical;

  const verdictKey = passesBoth
    ? 'verdictPassBoth'
    : passesFundamental
      ? 'verdictPassFundamental'
      : passesTechnical
        ? 'verdictPassTechnical'
        : 'verdictFail';

  const rsiState =
    candidate.rsi >= 70
      ? t(`${base}.rsiOverbought`)
      : candidate.rsi <= 30
        ? t(`${base}.rsiOversold`)
        : t(`${base}.rsiNeutral`);

  const gaugeColor = (v: number) =>
    v >= 70 ? theme.positive : v >= 45 ? theme.tint : theme.negative;

  // Each candidate maps to a short description key (alphaName/betaName/deltaName).
  const descriptionKey = `${candidate.ticker.toLowerCase()}Name`;

  return (
    <StationFrame station={station}>
      <View style={styles.selectorRow}>
        {CANDIDATES.map((c) => (
          <SelectorButton
            key={c.ticker}
            label={c.ticker}
            active={active === c.ticker}
            onPress={() => setActive(c.ticker)}
          />
        ))}
      </View>

      <ThemedText type="small" themeColor="textSecondary" style={styles.caption}>
        {t(`${base}.${descriptionKey}`)}
      </ThemedText>

      {/* Fundamental */}
      <ThemedView type="background" style={styles.detail}>
        <View style={styles.detailHeader}>
          <View style={styles.kickerColumn}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.kicker}>
              {t(`${base}.fundamentalKicker`).toUpperCase()}
            </ThemedText>
            <ThemedText type="smallBold">{t(`${base}.fundamentalTitle`)}</ThemedText>
          </View>
          <ThemedText
            type="smallBold"
            themeColor={passesFundamental ? 'positive' : 'negative'}>
            {passesFundamental ? t(`${base}.passes`) : t(`${base}.fails`)}
          </ThemedText>
        </View>
        <StatBar
          label={t(`${base}.moatLabel`)}
          value={candidate.moat}
          valueLabel={String(candidate.moat)}
          color={gaugeColor(candidate.moat)}
        />
        <StatBar
          label={t(`${base}.valuationLabel`)}
          value={candidate.valuation}
          valueLabel={String(candidate.valuation)}
          color={gaugeColor(candidate.valuation)}
        />
        <StatBar
          label={t(`${base}.balanceLabel`)}
          value={candidate.balance}
          valueLabel={String(candidate.balance)}
          color={gaugeColor(candidate.balance)}
        />
      </ThemedView>

      {/* Technical */}
      <ThemedView type="background" style={styles.detail}>
        <View style={styles.detailHeader}>
          <View style={styles.kickerColumn}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.kicker}>
              {t(`${base}.technicalKicker`).toUpperCase()}
            </ThemedText>
            <ThemedText type="smallBold">{t(`${base}.technicalTitle`)}</ThemedText>
          </View>
          <ThemedText
            type="smallBold"
            themeColor={passesTechnical ? 'positive' : 'negative'}>
            {passesTechnical ? t(`${base}.passes`) : t(`${base}.fails`)}
          </ThemedText>
        </View>
        <View style={styles.metricsRow}>
          <View style={styles.metric}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.kicker}>
              {t(`${base}.trendLabel`).toUpperCase()}
            </ThemedText>
            <ThemedText
              type="smallBold"
              themeColor={
                candidate.trend === 'up'
                  ? 'positive'
                  : candidate.trend === 'down'
                    ? 'negative'
                    : 'textSecondary'
              }>
              {t(`${base}.${TREND_KEY[candidate.trend]}`)}
            </ThemedText>
          </View>
          <View style={styles.metric}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.kicker}>
              {t(`${base}.rsiLabel`).toUpperCase()}
            </ThemedText>
            <ThemedText
              type="smallBold"
              themeColor={candidate.rsi >= 70 || candidate.rsi <= 30 ? 'negative' : 'tint'}>
              {candidate.rsi} · {rsiState}
            </ThemedText>
          </View>
        </View>
      </ThemedView>

      {/* Verdict */}
      <ThemedView
        type="backgroundSelected"
        style={[styles.verdict, { borderColor: passesBoth ? theme.tint : theme.border }]}>
        <View style={styles.verdictText}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.kicker}>
            {t(`${base}.verdictLabel`).toUpperCase()}
          </ThemedText>
          <ThemedText type="smallBold" themeColor={passesBoth ? 'tint' : 'textSecondary'}>
            {t(`${base}.${verdictKey}`)}
          </ThemedText>
        </View>
        <ThemedText type="subtitle" style={styles.checks}>
          <ThemedText themeColor={passesFundamental ? 'positive' : 'negative'}>
            {passesFundamental ? '✓' : '✗'}
          </ThemedText>{' '}
          <ThemedText themeColor={passesTechnical ? 'positive' : 'negative'}>
            {passesTechnical ? '✓' : '✗'}
          </ThemedText>
        </ThemedText>
      </ThemedView>

      <LessonBullets stationKey={station.key} />
    </StationFrame>
  );
}

const styles = StyleSheet.create({
  selectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  caption: {
    fontStyle: 'italic',
  },
  detail: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  kickerColumn: {
    gap: Spacing.half,
  },
  kicker: {
    letterSpacing: 1,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: Spacing.four,
  },
  metric: {
    gap: Spacing.half,
  },
  verdict: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    padding: Spacing.three,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  verdictText: {
    flex: 1,
    gap: Spacing.half,
  },
  checks: {
    fontSize: 24,
    lineHeight: 28,
  },
});
