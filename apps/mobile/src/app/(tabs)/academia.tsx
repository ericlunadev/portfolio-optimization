/**
 * Academia tab — the mobile port of the web "Academia" Top-Down guide
 * (apps/web/src/app/academia/page.tsx).
 *
 * Phase 1: a plain vertical ScrollView with an intro hero and the 5 stations in
 * order, each rendering its lesson copy (label/title/tagline/summary/bullets
 * from the `academia.*` i18n namespace) with lightweight, dependency-free RN
 * visuals (selectors, bars, chips, a colored correlation grid).
 *
 * DEFERRED to a later phase:
 *  - the SVG charts (donut, drawdown curve, sector wheel, price chart, mini
 *    efficient frontier) — would require react-native-svg;
 *  - the 3D rotating globe in Station 1 — would require expo-gl/expo-three;
 *  - the desktop scroll-spy StationNav and the contextual AcademiaDrawer /
 *    LessonButton surfacing the same lessons elsewhere in the app.
 */
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StationAllocation } from '@/components/academia/station-allocation';
import { StationAssets } from '@/components/academia/station-assets';
import { StationMacro } from '@/components/academia/station-macro';
import { StationPortfolio } from '@/components/academia/station-portfolio';
import { StationSectors } from '@/components/academia/station-sectors';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translations';

export default function AcademiaScreen() {
  const t = useTranslations();
  const theme = useTheme();

  const titleStart = t('academia.zoomIntro.titleStart');
  const titleHighlight = t('academia.zoomIntro.titleHighlight');

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['bottom']} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content}>
          {/* Intro hero — 2D treatment in place of the web's 3D globe. */}
          <ThemedView type="backgroundElement" style={styles.hero}>
            <ThemedText type="small" style={[styles.kicker, { color: theme.tint }]}>
              {t('academia.zoomIntro.kicker').toUpperCase()}
            </ThemedText>
            <ThemedText type="title" style={styles.heroTitle}>
              {titleStart ? `${titleStart} ` : ''}
              <ThemedText type="title" style={[styles.heroTitle, { color: theme.tint }]}>
                {titleHighlight}
              </ThemedText>
            </ThemedText>
            <ThemedText type="default" themeColor="textSecondary">
              {t('academia.zoomIntro.description')}
            </ThemedText>
            <View style={styles.dots}>
              {[1, 2, 3, 4, 5].map((n) => (
                <View key={n} style={[styles.dot, { borderColor: theme.tint }]}>
                  <ThemedText type="small" style={{ color: theme.tint }}>
                    {n}
                  </ThemedText>
                </View>
              ))}
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {t('academia.zoomIntro.summary')}
            </ThemedText>
          </ThemedView>

          <StationMacro />
          <StationAllocation />
          <StationSectors />
          <StationAssets />
          <StationPortfolio />

          <ThemedText type="small" themeColor="textSecondary" style={styles.footer}>
            {t('academia.page.footer')}
          </ThemedText>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  hero: {
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  kicker: {
    letterSpacing: 1.5,
  },
  heroTitle: {
    fontSize: 36,
    lineHeight: 42,
  },
  dots: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  dot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    textAlign: 'center',
    marginTop: Spacing.two,
  },
});
