/**
 * Station 5 — Portfolio construction.
 *
 * Phase 1: correlation matrix as a colored RN View grid (a heatmap is just
 * background colors — no SVG needed) + a frontier summary + a CTA that routes to
 * the optimizer tab. `TICKERS`/`CORRELATIONS` ported from the web Station.
 *
 * DEFERRED: the SVG mini efficient-frontier scatter + curve.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translations';

import { getStation } from './lessons';
import { LessonBullets, StationFrame } from './station-frame';

const TICKERS = ['ALPHA', 'BETA', 'GAMMA', 'DELTA'];

// Illustrative correlation matrix (port of the web CORRELATIONS const).
const CORRELATIONS: number[][] = [
  [1.0, 0.82, 0.15, -0.1],
  [0.82, 1.0, 0.3, 0.05],
  [0.15, 0.3, 1.0, 0.6],
  [-0.1, 0.05, 0.6, 1.0],
];

export function StationPortfolio() {
  const t = useTranslations();
  const theme = useTheme();
  const station = getStation('portfolio');
  const base = `academia.station5`;

  // Red (positive correlation = poor diversification), blue-ish (negative).
  const cellColor = (v: number): string => {
    const alpha = Math.min(1, Math.abs(v) * 0.85 + 0.08);
    const channel = Math.round(alpha * 255)
      .toString(16)
      .padStart(2, '0');
    return `${v >= 0 ? theme.negative : theme.tint}${channel}`;
  };

  return (
    <StationFrame station={station}>
      {/* Correlation matrix */}
      <ThemedView type="background" style={styles.detail}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.kicker}>
          {t(`${base}.correlationKicker`).toUpperCase()}
        </ThemedText>
        <ThemedText type="smallBold">{t(`${base}.correlationTitle`)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t(`${base}.correlationDescription`)}
        </ThemedText>

        <View style={styles.matrix}>
          <View style={styles.matrixRow}>
            <View style={styles.matrixCorner} />
            {TICKERS.map((tk) => (
              <View key={tk} style={styles.matrixHeadCell}>
                <ThemedText type="code">{tk}</ThemedText>
              </View>
            ))}
          </View>
          {CORRELATIONS.map((row, i) => (
            <View key={TICKERS[i]} style={styles.matrixRow}>
              <View style={styles.matrixHeadCell}>
                <ThemedText type="code">{TICKERS[i]}</ThemedText>
              </View>
              {row.map((v, j) => (
                <View
                  key={`${TICKERS[i]}-${TICKERS[j]}`}
                  style={[
                    styles.matrixCell,
                    {
                      backgroundColor: i === j ? theme.backgroundSelected : cellColor(v),
                      borderColor: theme.border,
                    },
                  ]}>
                  <ThemedText type="code">{v.toFixed(2)}</ThemedText>
                </View>
              ))}
            </View>
          ))}
        </View>
      </ThemedView>

      {/* Efficient frontier (text summary; chart deferred) */}
      <ThemedView type="background" style={styles.detail}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.kicker}>
          {t(`${base}.frontierKicker`).toUpperCase()}
        </ThemedText>
        <ThemedText type="smallBold">{t(`${base}.frontierTitle`)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t(`${base}.frontierDescription`)}
        </ThemedText>
        <View style={styles.axisRow}>
          <ThemedText type="small" style={{ color: theme.tint }}>
            {t(`${base}.maxSharpeLabel`)}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t(`${base}.axisRisk`)} · {t(`${base}.axisReturn`)}
          </ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={styles.caption}>
          {t(`${base}.frontierCaption`)}
        </ThemedText>
      </ThemedView>

      <LessonBullets stationKey={station.key} />

      {/* CTA → optimizer tab */}
      <ThemedView
        type="backgroundSelected"
        style={[styles.cta, { borderColor: theme.tint }]}>
        <ThemedText type="smallBold" style={styles.ctaTitle}>
          {t(`${base}.ctaTitle`)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.ctaText}>
          {t(`${base}.ctaDescription`)}
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.navigate('/optimizer')}
          style={({ pressed }) => [
            styles.ctaButton,
            { backgroundColor: theme.tint },
            pressed && styles.ctaButtonPressed,
          ]}>
          <Ionicons name="flash" size={16} color={theme.background} />
          <ThemedText type="smallBold" style={{ color: theme.background }}>
            {t(`${base}.ctaButton`)}
          </ThemedText>
          <Ionicons name="arrow-forward" size={16} color={theme.background} />
        </Pressable>
      </ThemedView>
    </StationFrame>
  );
}

const styles = StyleSheet.create({
  detail: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  kicker: {
    letterSpacing: 1,
  },
  matrix: {
    gap: Spacing.half,
    marginTop: Spacing.one,
  },
  matrixRow: {
    flexDirection: 'row',
    gap: Spacing.half,
  },
  matrixCorner: {
    width: 52,
    height: 28,
  },
  matrixHeadCell: {
    width: 52,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matrixCell: {
    width: 52,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.one,
    borderWidth: StyleSheet.hairlineWidth,
  },
  axisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: Spacing.one,
  },
  caption: {
    fontStyle: 'italic',
  },
  cta: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.two,
    alignItems: 'center',
  },
  ctaTitle: {
    fontSize: 20,
    lineHeight: 26,
    textAlign: 'center',
  },
  ctaText: {
    textAlign: 'center',
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    marginTop: Spacing.one,
  },
  ctaButtonPressed: {
    opacity: 0.85,
  },
});
