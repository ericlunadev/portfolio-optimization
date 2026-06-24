import Ionicons from '@expo/vector-icons/Ionicons';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useCheckout, usePackages, useRefreshBilling } from '@/hooks/use-billing';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translations';
import type { BillingRail, CreditPackage } from '@/lib/api/billing';
import { formatUsdCents } from '@/lib/format';

const RAILS: { rail: BillingRail; labelKey: string }[] = [
  { rail: 'stripe', labelKey: 'billing.railCard' },
  { rail: 'coinbase_commerce', labelKey: 'billing.railCrypto' },
];

/** Buy-credits panel: pick a rail, a package, acknowledge, then check out. */
export function PackagePicker() {
  const t = useTranslations();
  const theme = useTheme();
  const refresh = useRefreshBilling();

  const [rail, setRail] = useState<BillingRail>('stripe');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  const packages = usePackages(rail);
  const checkout = useCheckout();

  const switchRail = (next: BillingRail) => {
    setRail(next);
    setSelectedId(null);
  };

  const handleBuy = () => {
    if (!selectedId) return;
    checkout.mutate(
      { rail, packageId: selectedId },
      {
        onSuccess: async ({ url }) => {
          // Stripe / Coinbase redirect back to the web `/billing` page on
          // success; once the hosted flow closes we refetch so the webhook's
          // credit grant shows up here.
          await WebBrowser.openBrowserAsync(url);
          refresh();
        },
      },
    );
  };

  const buyDisabled = !selectedId || !acknowledged || checkout.isPending;
  const noteKey = rail === 'coinbase_commerce' ? 'billing.cryptoNote' : 'billing.usdOnlyNote';
  const buyLabelKey = rail === 'coinbase_commerce' ? 'billing.buyButtonCrypto' : 'billing.buyButton';

  return (
    <View style={styles.container}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {t('billing.buyTitle').toUpperCase()}
      </ThemedText>

      <View style={[styles.rails, { borderColor: theme.border }]}>
        {RAILS.map(({ rail: value, labelKey }) => {
          const active = value === rail;
          return (
            <Pressable
              key={value}
              accessibilityRole="button"
              onPress={() => switchRail(value)}
              style={[styles.railTab, active && { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText type="smallBold" themeColor={active ? 'text' : 'textSecondary'}>
                {t(labelKey)}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {packages.isLoading ? (
        <ActivityIndicator color={theme.tint} style={styles.loader} />
      ) : packages.isError ? (
        <ThemedText type="small" themeColor="negative">
          {t('billing.errorCheckout')}
        </ThemedText>
      ) : !packages.data?.length ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('billing.noPackages')}
        </ThemedText>
      ) : (
        <View style={styles.packages}>
          {packages.data.map((pkg) => (
            <PackageOption
              key={pkg.id}
              pkg={pkg}
              selected={pkg.id === selectedId}
              onSelect={() => setSelectedId(pkg.id)}
            />
          ))}
        </View>
      )}

      <ThemedText type="small" themeColor="textSecondary">
        {t(noteKey)}
      </ThemedText>

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: acknowledged }}
        onPress={() => setAcknowledged((prev) => !prev)}
        style={styles.ackRow}>
        <Ionicons
          name={acknowledged ? 'checkbox' : 'square-outline'}
          size={22}
          color={acknowledged ? theme.tint : theme.textSecondary}
        />
        <ThemedText type="small" style={styles.ackLabel}>
          {t('billing.salesFinalAck')}
        </ThemedText>
      </Pressable>

      {checkout.isError ? (
        <ThemedText type="small" themeColor="negative">
          {t('billing.errorCheckout')}
        </ThemedText>
      ) : null}

      <Pressable
        accessibilityRole="button"
        disabled={buyDisabled}
        onPress={handleBuy}
        style={({ pressed }) => [
          styles.buyButton,
          { backgroundColor: theme.tint },
          buyDisabled && styles.buyButtonDisabled,
          pressed && !buyDisabled && styles.buyButtonPressed,
        ]}>
        {checkout.isPending ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <ThemedText type="default" style={styles.buyLabel}>
            {t(buyLabelKey)}
          </ThemedText>
        )}
      </Pressable>
    </View>
  );
}

function PackageOption({
  pkg,
  selected,
  onSelect,
}: {
  pkg: CreditPackage;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations();
  const theme = useTheme();
  const perCredit = (pkg.priceMinor / 100 / pkg.credits).toFixed(2);

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onSelect}
      style={styles.optionPressable}>
      <ThemedView
        type="backgroundElement"
        style={[styles.option, { borderColor: selected ? theme.tint : theme.border }]}>
        <ThemedText type="subtitle" style={styles.optionCredits}>
          {pkg.credits}
        </ThemedText>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {t('billing.creditsUnit')}
        </ThemedText>
        <ThemedText type="default" style={styles.optionPrice}>
          {formatUsdCents(pkg.priceMinor)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('billing.perCreditCost', { cost: perCredit })}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  rails: {
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    padding: Spacing.half,
    gap: Spacing.half,
  },
  railTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
  },
  loader: {
    alignSelf: 'center',
    marginVertical: Spacing.three,
  },
  packages: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  optionPressable: {
    flexGrow: 1,
    flexBasis: '47%',
  },
  option: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  optionCredits: {
    lineHeight: 36,
  },
  optionPrice: {
    marginTop: Spacing.one,
    fontWeight: 700,
  },
  ackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  ackLabel: {
    flex: 1,
  },
  buyButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
  },
  buyButtonDisabled: {
    opacity: 0.4,
  },
  buyButtonPressed: {
    opacity: 0.85,
  },
  buyLabel: {
    color: '#ffffff',
    fontWeight: 700,
  },
});
