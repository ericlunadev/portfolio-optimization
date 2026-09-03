import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translations';

/**
 * Surfaces where an investing disclaimer is shown. Mirrors the web app's
 * `Legal` namespace so both clients state the same thing.
 */
export type DisclaimerVariant = 'results' | 'projections' | 'profile';

type DisclaimerProps = {
  variant: DisclaimerVariant;
  /** Frames the notice in a bordered box instead of running it as a footnote. */
  boxed?: boolean;
};

export function Disclaimer({ variant, boxed = false }: DisclaimerProps) {
  const t = useTranslations();
  const theme = useTheme();
  const text = t(`legal.${variant}`);

  if (!boxed) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        {text}
      </ThemedText>
    );
  }

  return (
    <View style={[styles.box, { borderColor: theme.border }]}>
      <ThemedText type="small" themeColor="textSecondary">
        {text}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    padding: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
  },
});
