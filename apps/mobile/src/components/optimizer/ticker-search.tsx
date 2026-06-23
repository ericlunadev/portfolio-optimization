import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translations';
import { searchTickers } from '@/lib/api/tickers';

type TickerSearchProps = {
  selected: string[];
  onAdd: (symbol: string) => void;
  onRemove: (symbol: string) => void;
};

/** Search-as-you-type ticker picker rendering selected symbols as chips. */
export function TickerSearch({ selected, onAdd, onRemove }: TickerSearchProps) {
  const t = useTranslations();
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query.trim(), 300);

  const search = useQuery({
    queryKey: ['ticker-search', debouncedQuery],
    queryFn: () => searchTickers(debouncedQuery),
    enabled: debouncedQuery.length > 0,
    staleTime: 60_000,
  });

  const suggestions = (search.data ?? []).filter((r) => !selected.includes(r.symbol.toUpperCase()));

  const handleAdd = (symbol: string) => {
    onAdd(symbol);
    setQuery('');
  };

  return (
    <View style={styles.container}>
      {selected.length > 0 ? (
        <View style={styles.chips}>
          {selected.map((symbol) => (
            <Pressable
              key={symbol}
              accessibilityRole="button"
              onPress={() => onRemove(symbol)}
              style={[styles.chip, { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText type="smallBold">{symbol}</ThemedText>
              <Ionicons name="close" size={16} color={theme.textSecondary} />
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={[styles.inputRow, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
        <Ionicons name="search" size={18} color={theme.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('optimizer.searchPlaceholder')}
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="characters"
          autoCorrect={false}
          style={[styles.input, { color: theme.text }]}
        />
        {search.isFetching ? <ActivityIndicator color={theme.textSecondary} /> : null}
      </View>

      {debouncedQuery.length > 0 ? (
        <View style={[styles.suggestions, { borderColor: theme.border }]}>
          {suggestions.length === 0 && !search.isFetching ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.suggestionEmpty}>
              {t('optimizer.noResults')}
            </ThemedText>
          ) : (
            suggestions.map((result) => (
              <Pressable
                key={`${result.symbol}-${result.exchange}`}
                accessibilityRole="button"
                onPress={() => handleAdd(result.symbol.toUpperCase())}
                style={({ pressed }) => [
                  styles.suggestion,
                  { borderTopColor: theme.border },
                  pressed && { backgroundColor: theme.backgroundSelected },
                ]}>
                <View style={styles.suggestionText}>
                  <ThemedText type="smallBold">{result.symbol}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {result.name}
                  </ThemedText>
                </View>
                {result.exchange ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {result.exchange}
                  </ThemedText>
                ) : null}
              </Pressable>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.two,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  input: {
    flex: 1,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  suggestions: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    overflow: 'hidden',
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    padding: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  suggestionText: {
    flex: 1,
    gap: 2,
  },
  suggestionEmpty: {
    padding: Spacing.three,
  },
});
