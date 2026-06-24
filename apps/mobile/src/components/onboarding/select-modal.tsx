import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translations';

export type SelectOption = {
  value: string;
  label: string;
};

/**
 * A select control built from RN primitives (no `<select>` exists): a tappable
 * field that opens a full-screen searchable list. Used for the country and
 * currency pickers in onboarding Step 1.
 */
export function SelectModal({
  label,
  value,
  options,
  onSelect,
  accessibilityLabel,
  searchable = true,
}: {
  label: string;
  value: string;
  options: readonly SelectOption[];
  onSelect: (value: string) => void;
  accessibilityLabel: string;
  searchable?: boolean;
}) {
  const theme = useTheme();
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selectedLabel = useMemo(
    () => options.find((option) => option.value === value)?.label ?? value,
    [options, value],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(needle) ||
        option.value.toLowerCase().includes(needle),
    );
  }, [options, query]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ text: selectedLabel }}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.field,
          { borderColor: theme.border, backgroundColor: theme.backgroundElement },
          pressed && styles.fieldPressed,
        ]}>
        <ThemedText type="default">{selectedLabel}</ThemedText>
        <Ionicons name="chevron-down" size={18} color={theme.textSecondary} />
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={close}>
        <ThemedView style={styles.modal}>
          <SafeAreaView edges={['top', 'bottom']} style={styles.modalSafe}>
            <View style={styles.modalHeader}>
              <ThemedText type="subtitle">{label}</ThemedText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('onboarding.close')}
                hitSlop={Spacing.two}
                onPress={close}>
                <Ionicons name="close" size={24} color={theme.text} />
              </Pressable>
            </View>

            {searchable ? (
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={t('onboarding.searchPlaceholder')}
                placeholderTextColor={theme.textSecondary}
                autoCorrect={false}
                autoFocus
                style={[
                  styles.search,
                  {
                    color: theme.text,
                    borderColor: theme.border,
                    backgroundColor: theme.backgroundElement,
                  },
                ]}
              />
            ) : null}

            <FlatList
              data={filtered}
              keyExtractor={(item) => item.value}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const active = item.value === value;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={item.label}
                    onPress={() => {
                      onSelect(item.value);
                      close();
                    }}
                    style={({ pressed }) => [
                      styles.option,
                      { borderBottomColor: theme.border },
                      pressed && { backgroundColor: theme.backgroundElement },
                    ]}>
                    <ThemedText type="default" themeColor={active ? 'tint' : 'text'}>
                      {item.label}
                    </ThemedText>
                    {active ? (
                      <Ionicons name="checkmark" size={18} color={theme.tint} />
                    ) : null}
                  </Pressable>
                );
              }}
            />
          </SafeAreaView>
        </ThemedView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  fieldPressed: {
    opacity: 0.7,
  },
  modal: {
    flex: 1,
  },
  modalSafe: {
    flex: 1,
    paddingHorizontal: Spacing.four,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.three,
    gap: Spacing.three,
  },
  search: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
    marginBottom: Spacing.three,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
