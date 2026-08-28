import { StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translations';
import type { AssetLimit, AssetLimits } from '@/lib/optimizer/asset-limits';

type AssetLimitRowsProps = {
  tickers: string[];
  limits: AssetLimits;
  onChange: (symbol: string, field: keyof AssetLimit, value: string) => void;
};

/**
 * One min/max percentage pair per selected ticker. Blank fields mean "no limit
 * of its own", so the asset keeps the portfolio-wide range.
 */
export function AssetLimitRows({ tickers, limits, onChange }: AssetLimitRowsProps) {
  const t = useTranslations();

  if (tickers.length === 0) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        {t('optimizer.assetLimitsEmpty')}
      </ThemedText>
    );
  }

  return (
    <View style={styles.rows}>
      <View style={styles.headerRow}>
        <View style={styles.tickerCell} />
        <ThemedText type="small" themeColor="textSecondary" style={styles.headerCell}>
          {t('optimizer.limitMin')}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.headerCell}>
          {t('optimizer.limitMax')}
        </ThemedText>
      </View>

      {tickers.map((symbol) => (
        <View key={symbol} style={styles.row}>
          <ThemedText type="smallBold" numberOfLines={1} style={styles.tickerCell}>
            {symbol}
          </ThemedText>
          <LimitField
            value={limits[symbol]?.min ?? ''}
            onChangeText={(value) => onChange(symbol, 'min', value)}
            placeholder="0"
            accessibilityLabel={t('optimizer.limitMinAria', { ticker: symbol })}
          />
          <LimitField
            value={limits[symbol]?.max ?? ''}
            onChangeText={(value) => onChange(symbol, 'max', value)}
            placeholder="100"
            accessibilityLabel={t('optimizer.limitMaxAria', { ticker: symbol })}
          />
        </View>
      ))}
    </View>
  );
}

function LimitField({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  accessibilityLabel: string;
}) {
  const theme = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      keyboardType="decimal-pad"
      inputMode="decimal"
      placeholder={placeholder}
      placeholderTextColor={theme.textSecondary}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.field,
        {
          color: theme.text,
          borderColor: theme.border,
          backgroundColor: theme.backgroundElement,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  rows: {
    gap: Spacing.two,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  headerCell: {
    flex: 1,
    textAlign: 'right',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  tickerCell: {
    flex: 1,
  },
  field: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
    textAlign: 'right',
  },
});
