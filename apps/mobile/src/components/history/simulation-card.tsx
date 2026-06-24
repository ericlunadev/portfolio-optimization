import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translations';
import type { SimulationListItem } from '@/lib/api/simulations';
import { formatDate, formatNumber, formatPercent } from '@/lib/format';

type SimulationCardProps = {
  item: SimulationListItem;
  onPress: () => void;
  onTogglePin: () => void;
  onRerun: () => void;
  onDelete: () => void;
  isRerunning: boolean;
};

/** Builds a display name when the user hasn't named the run: "AAPL, MSFT · Max Sharpe". */
export function useSimulationTitle(item: Pick<SimulationListItem, 'name' | 'tickers' | 'strategy'>): string {
  const t = useTranslations();
  if (item.name) return item.name;
  const tickers = item.tickers.join(', ');
  const strategy = t(`optimizer.strategies.${item.strategy}.label`);
  return tickers ? `${tickers} · ${strategy}` : strategy;
}

/** One saved optimization in the history list, with quick actions. */
export function SimulationCard({
  item,
  onPress,
  onTogglePin,
  onRerun,
  onDelete,
  isRerunning,
}: SimulationCardProps) {
  const t = useTranslations();
  const theme = useTheme();
  const title = useSimulationTitle(item);

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <Pressable accessibilityRole="button" onPress={onPress} style={styles.body}>
        <View style={styles.titleRow}>
          {item.pinned ? (
            <Ionicons name="pin" size={14} color={theme.tint} style={styles.pinIcon} />
          ) : null}
          <ThemedText type="smallBold" style={styles.title} numberOfLines={1}>
            {title}
          </ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {formatDate(item.createdAt)}
        </ThemedText>

        <View style={styles.metrics}>
          <Metric label={t('history.colReturn')} value={formatPercent(item.expectedReturn)} />
          <Metric label={t('history.colVolatility')} value={formatPercent(item.volatility)} />
          <Metric label={t('history.colSharpe')} value={formatNumber(item.sharpeRatio)} />
        </View>
      </Pressable>

      <View style={[styles.actions, { borderTopColor: theme.border }]}>
        <ActionButton
          icon={item.pinned ? 'pin' : 'pin-outline'}
          label={item.pinned ? t('history.unpin') : t('history.pin')}
          color={item.pinned ? theme.tint : theme.textSecondary}
          onPress={onTogglePin}
        />
        <ActionButton
          icon="refresh"
          label={t('history.rerun')}
          color={theme.textSecondary}
          onPress={onRerun}
          busy={isRerunning}
        />
        <ActionButton
          icon="trash-outline"
          label={t('history.delete')}
          color={theme.negative}
          onPress={onDelete}
        />
      </View>
    </ThemedView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
    </View>
  );
}

function ActionButton({
  icon,
  label,
  color,
  onPress,
  busy,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  color: string;
  onPress: () => void;
  busy?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={busy}
      onPress={onPress}
      hitSlop={Spacing.two}
      style={styles.action}>
      {busy ? (
        <ActivityIndicator color={color} size="small" />
      ) : (
        <Ionicons name={icon} size={18} color={color} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.three,
    overflow: 'hidden',
  },
  body: {
    padding: Spacing.three,
    gap: Spacing.one,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  pinIcon: {
    marginTop: 1,
  },
  title: {
    flex: 1,
  },
  metrics: {
    flexDirection: 'row',
    gap: Spacing.four,
    marginTop: Spacing.one,
  },
  metric: {
    gap: Spacing.half,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.four,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  action: {
    padding: Spacing.one,
  },
});
