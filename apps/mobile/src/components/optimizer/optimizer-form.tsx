import { Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';

import { DateRangeInput } from '@/components/optimizer/date-range-input';
import { StrategyPicker } from '@/components/optimizer/strategy-picker';
import { TickerSearch } from '@/components/optimizer/ticker-search';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translations';
import type { OptimizerForm as OptimizerFormState } from '@/hooks/use-optimizer-form';

type OptimizerFormProps = {
  form: OptimizerFormState;
  isSubmitting: boolean;
  onSubmit: () => void;
};

/** The full optimizer input form. State is owned by the parent via `form`. */
export function OptimizerForm({ form, isSubmitting, onSubmit }: OptimizerFormProps) {
  const t = useTranslations();
  const theme = useTheme();

  const submitDisabled = !form.isValid || isSubmitting;

  return (
    <View style={styles.container}>
      <Section title={t('optimizer.assetsLabel')}>
        <TickerSearch selected={form.tickers} onAdd={form.addTicker} onRemove={form.removeTicker} />
        {!form.hasEnoughTickers ? (
          <ThemedText type="small" themeColor="textSecondary">
            {t('optimizer.addAtLeastTwo')}
          </ThemedText>
        ) : null}
      </Section>

      <Section title={t('optimizer.strategyLabel')}>
        <StrategyPicker value={form.strategy} onChange={form.setStrategy} />
      </Section>

      {form.param === 'risk_free_rate' ? (
        <PercentInput
          label={t('optimizer.riskFreeRate')}
          value={form.riskFreeRate}
          onChangeText={form.setRiskFreeRate}
        />
      ) : null}
      {form.param === 'target_return' ? (
        <PercentInput
          label={t('optimizer.targetReturn')}
          value={form.targetReturn}
          onChangeText={form.setTargetReturn}
        />
      ) : null}
      {form.param === 'target_risk' ? (
        <PercentInput
          label={t('optimizer.targetRisk')}
          value={form.targetRisk}
          onChangeText={form.setTargetRisk}
        />
      ) : null}

      <Section title={t('optimizer.constraintsLabel')}>
        <ToggleRow
          label={t('optimizer.fullInvestment')}
          value={form.enforceFullInvestment}
          onValueChange={form.setEnforceFullInvestment}
        />
        <ToggleRow
          label={t('optimizer.allowShortSelling')}
          value={form.allowShortSelling}
          onValueChange={form.setAllowShortSelling}
        />
      </Section>

      <Section title={t('optimizer.dateRangeLabel')}>
        <ToggleRow
          label={t('optimizer.useDateRange')}
          value={form.useDateRange}
          onValueChange={form.setUseDateRange}
        />
        {form.useDateRange ? (
          <DateRangeInput
            startMonth={form.startMonth}
            startYear={form.startYear}
            endMonth={form.endMonth}
            endYear={form.endYear}
            onChangeStartMonth={form.setStartMonth}
            onChangeStartYear={form.setStartYear}
            onChangeEndMonth={form.setEndMonth}
            onChangeEndYear={form.setEndYear}
            invalid={form.dateRangeInvalid}
          />
        ) : null}
      </Section>

      <Section title={t('optimizer.leverageLabel')}>
        <ToggleRow
          label={t('optimizer.useLeverage')}
          value={form.useLeverage}
          onValueChange={form.setUseLeverage}
        />
        {form.useLeverage ? (
          <PercentInput
            label={t('optimizer.maxLeverage')}
            value={form.maxLeverage}
            onChangeText={form.setMaxLeverage}
            placeholder="1.5"
          />
        ) : null}
      </Section>

      <Section title={t('optimizer.assetConstraintsLabel')}>
        <ToggleRow
          label={t('optimizer.useAssetConstraints')}
          value={form.useAssetConstraints}
          onValueChange={form.setUseAssetConstraints}
        />
        {form.useAssetConstraints ? (
          <PercentInput
            label={t('optimizer.maxWeightPerAsset')}
            value={form.maxWeightPerAsset}
            onChangeText={form.setMaxWeightPerAsset}
            placeholder="40"
          />
        ) : null}
      </Section>

      <Pressable
        accessibilityRole="button"
        disabled={submitDisabled}
        onPress={onSubmit}
        style={({ pressed }) => [
          styles.submit,
          { backgroundColor: theme.tint },
          submitDisabled && styles.submitDisabled,
          pressed && !submitDisabled && styles.submitPressed,
        ]}>
        <ThemedText type="default" style={styles.submitLabel}>
          {isSubmitting ? t('optimizer.optimizing') : t('optimizer.optimize')}
        </ThemedText>
      </Pressable>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {title.toUpperCase()}
      </ThemedText>
      {children}
    </View>
  );
}

function PercentInput({
  label,
  value,
  onChangeText,
  placeholder = '0',
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {label.toUpperCase()}
      </ThemedText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        inputMode="decimal"
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.percentInput,
          { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement },
        ]}
      />
    </View>
  );
}

function ToggleRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.toggleRow}>
      <ThemedText type="default" style={styles.toggleLabel}>
        {label}
      </ThemedText>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ true: theme.tint }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.four,
  },
  section: {
    gap: Spacing.two,
  },
  percentInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  toggleLabel: {
    flex: 1,
  },
  submit: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
  },
  submitDisabled: {
    opacity: 0.4,
  },
  submitPressed: {
    opacity: 0.85,
  },
  submitLabel: {
    color: '#ffffff',
    fontWeight: 700,
  },
});
