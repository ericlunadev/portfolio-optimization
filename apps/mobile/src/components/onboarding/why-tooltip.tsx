import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translations';

/**
 * RN equivalent of the web `WhyTooltip`: a small info affordance that toggles a
 * line of explanatory helper text. RN has no hover, so the "why" copy expands
 * inline on tap instead of floating in a popover.
 */
export function WhyTooltip({ content }: { content: string }) {
  const theme = useTheme();
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.wrapper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('onboarding.whyLabel')}
        accessibilityState={{ expanded: open }}
        hitSlop={Spacing.two}
        onPress={() => setOpen((prev) => !prev)}>
        <Ionicons name="information-circle-outline" size={16} color={theme.textSecondary} />
      </Pressable>
      {open ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.content}>
          {content}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexShrink: 1,
  },
  content: {
    marginTop: Spacing.one,
  },
});
