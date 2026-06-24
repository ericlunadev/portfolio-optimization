import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useLedger } from '@/hooks/use-billing';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translations';
import type { LedgerEntry } from '@/lib/api/billing';
import { formatDate } from '@/lib/format';

/** Paginated history of credit movements (purchases, spends, grants). */
export function LedgerList() {
  const t = useTranslations();
  const theme = useTheme();
  const ledger = useLedger();

  const entries = ledger.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <View style={styles.container}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {t('billing.ledgerTitle').toUpperCase()}
      </ThemedText>

      {ledger.isLoading ? (
        <ActivityIndicator color={theme.tint} style={styles.loader} />
      ) : entries.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('billing.emptyLedger')}
        </ThemedText>
      ) : (
        <View>
          <View style={[styles.row, styles.headerRow, { borderBottomColor: theme.border }]}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.colType}>
              {t('billing.colType')}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.colNum}>
              {t('billing.colDelta')}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.colNum}>
              {t('billing.colBalanceAfter')}
            </ThemedText>
          </View>
          {entries.map((entry) => (
            <LedgerRow key={entry.id} entry={entry} />
          ))}
          {ledger.hasNextPage ? (
            <Pressable
              accessibilityRole="button"
              disabled={ledger.isFetchingNextPage}
              onPress={() => ledger.fetchNextPage()}
              style={styles.loadMore}>
              <ThemedText type="link" themeColor="tint">
                {ledger.isFetchingNextPage ? t('billing.loadingMore') : t('billing.loadMore')}
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

function LedgerRow({ entry }: { entry: LedgerEntry }) {
  const t = useTranslations();
  const theme = useTheme();
  const positive = entry.delta > 0;
  const deltaColor = positive ? theme.positive : theme.negative;

  return (
    <View style={[styles.row, { borderBottomColor: theme.border }]}>
      <View style={styles.colType}>
        <ThemedText type="smallBold">{t(`billing.reason.${entry.reason}`)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {formatDate(entry.createdAt)}
        </ThemedText>
      </View>
      <ThemedText type="smallBold" style={[styles.colNum, { color: deltaColor }]}>
        {positive ? `+${entry.delta}` : entry.delta}
      </ThemedText>
      <ThemedText type="small" style={styles.colNum}>
        {entry.balanceAfter}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  loader: {
    alignSelf: 'flex-start',
    marginVertical: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerRow: {
    paddingBottom: Spacing.two,
  },
  colType: {
    flex: 1.4,
    gap: Spacing.half,
  },
  colNum: {
    flex: 1,
    textAlign: 'right',
  },
  loadMore: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
});
