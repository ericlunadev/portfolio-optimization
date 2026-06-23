import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translations';
import type { OptimizationResult } from '@/lib/api/optimization';
import { formatNumber, formatPercent } from '@/lib/format';

type OptimizationResultsProps = {
  result: OptimizationResult;
};

/** Read-only summary of an optimal portfolio: key metrics + allocation table. */
export function OptimizationResults({ result }: OptimizationResultsProps) {
  const t = useTranslations();
  const theme = useTheme();

  const weights = [...result.weights].sort((a, b) => b.weight - a.weight);

  return (
    <View style={styles.container}>
      <View style={styles.cards}>
        <StatCard
          label={t('optimizer.expectedReturn')}
          value={formatPercent(result.expected_return)}
          hint={`${t('optimizer.ci95')}: ${formatPercent(result.stats.ci_95_low)} – ${formatPercent(result.stats.ci_95_high)}`}
        />
        <StatCard label={t('optimizer.volatility')} value={formatPercent(result.volatility)} />
        <StatCard label={t('optimizer.sharpeRatio')} value={formatNumber(result.sharpe_ratio)} />
        <StatCard
          label={t('optimizer.probNeg1y')}
          value={formatPercent(result.stats.prob_neg_1y)}
          hint={`${t('optimizer.probNeg2y')}: ${formatPercent(result.stats.prob_neg_2y)}`}
        />
      </View>

      <View style={styles.section}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {t('optimizer.weightsTitle').toUpperCase()}
        </ThemedText>

        <View style={[styles.tableHeader, { borderBottomColor: theme.border }]}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.colAsset}>
            {t('optimizer.colAsset')}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.colNum}>
            {t('optimizer.colExpReturn')}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.colNum}>
            {t('optimizer.colVolatility')}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.colNum}>
            {t('optimizer.colWeight')}
          </ThemedText>
        </View>

        {weights.map((w) => (
          <View key={w.fund_id} style={[styles.tableRow, { borderBottomColor: theme.border }]}>
            <ThemedText type="smallBold" style={styles.colAsset}>
              {w.fund_name}
            </ThemedText>
            <ThemedText type="small" style={styles.colNum}>
              {formatPercent(w.exp_ret)}
            </ThemedText>
            <ThemedText type="small" style={styles.colNum}>
              {formatPercent(w.volatility)}
            </ThemedText>
            <ThemedText type="smallBold" style={styles.colNum}>
              {formatPercent(w.weight)}
            </ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="subtitle">{value}</ThemedText>
      {hint ? (
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.four,
  },
  cards: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  card: {
    flexGrow: 1,
    flexBasis: '47%',
    gap: Spacing.one,
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  section: {
    gap: Spacing.two,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  colAsset: {
    flex: 1.4,
  },
  colNum: {
    flex: 1,
    textAlign: 'right',
  },
});
