import { StyleSheet, View } from 'react-native';

import { SelectModal, type SelectOption } from '@/components/onboarding/select-modal';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTranslations } from '@/hooks/use-translations';

const FIRST_YEAR = 1970;

/** Month value/label pairs (1–12), labels pulled from the optimizer namespace. */
function useMonthOptions(): SelectOption[] {
  const t = useTranslations();
  const keys = [
    'monthJan',
    'monthFeb',
    'monthMar',
    'monthApr',
    'monthMay',
    'monthJun',
    'monthJul',
    'monthAug',
    'monthSep',
    'monthOct',
    'monthNov',
    'monthDec',
  ] as const;
  return keys.map((key, index) => ({
    value: String(index + 1),
    label: t(`optimizer.months.${key}`),
  }));
}

/** Descending list of selectable years, current year first. */
function useYearOptions(): SelectOption[] {
  const currentYear = new Date().getFullYear();
  const options: SelectOption[] = [];
  for (let year = currentYear; year >= FIRST_YEAR; year -= 1) {
    options.push({ value: String(year), label: String(year) });
  }
  return options;
}

type DateRangeInputProps = {
  startMonth: number;
  startYear: number;
  endMonth: number;
  endYear: number;
  onChangeStartMonth: (month: number) => void;
  onChangeStartYear: (year: number) => void;
  onChangeEndMonth: (month: number) => void;
  onChangeEndYear: (year: number) => void;
  /** True when start > end; surfaces an inline validation hint. */
  invalid: boolean;
};

/**
 * Start/end month+year selectors built from {@link SelectModal} (no native date
 * picker dependency). The parent maps the selected months onto ISO
 * `start_date`/`end_date` strings; this component only edits the four parts and
 * shows a validation hint when the range is inverted.
 */
export function DateRangeInput({
  startMonth,
  startYear,
  endMonth,
  endYear,
  onChangeStartMonth,
  onChangeStartYear,
  onChangeEndMonth,
  onChangeEndYear,
  invalid,
}: DateRangeInputProps) {
  const t = useTranslations();
  const months = useMonthOptions();
  const years = useYearOptions();

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.rowLabel}>
          {t('optimizer.startDate')}
        </ThemedText>
        <View style={styles.pickers}>
          <View style={styles.picker}>
            <SelectModal
              label={t('optimizer.startDate')}
              accessibilityLabel={t('optimizer.startDate')}
              value={String(startMonth)}
              options={months}
              searchable={false}
              onSelect={(value) => onChangeStartMonth(Number(value))}
            />
          </View>
          <View style={styles.picker}>
            <SelectModal
              label={t('optimizer.startDate')}
              accessibilityLabel={t('optimizer.startDate')}
              value={String(startYear)}
              options={years}
              onSelect={(value) => onChangeStartYear(Number(value))}
            />
          </View>
        </View>
      </View>

      <View style={styles.row}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.rowLabel}>
          {t('optimizer.endDate')}
        </ThemedText>
        <View style={styles.pickers}>
          <View style={styles.picker}>
            <SelectModal
              label={t('optimizer.endDate')}
              accessibilityLabel={t('optimizer.endDate')}
              value={String(endMonth)}
              options={months}
              searchable={false}
              onSelect={(value) => onChangeEndMonth(Number(value))}
            />
          </View>
          <View style={styles.picker}>
            <SelectModal
              label={t('optimizer.endDate')}
              accessibilityLabel={t('optimizer.endDate')}
              value={String(endYear)}
              options={years}
              onSelect={(value) => onChangeEndYear(Number(value))}
            />
          </View>
        </View>
      </View>

      {invalid ? (
        <ThemedText type="small" themeColor="negative">
          {t('optimizer.dateRangeInvalid')}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  row: {
    gap: Spacing.two,
  },
  rowLabel: {
    textTransform: 'uppercase',
  },
  pickers: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  picker: {
    flex: 1,
  },
});
