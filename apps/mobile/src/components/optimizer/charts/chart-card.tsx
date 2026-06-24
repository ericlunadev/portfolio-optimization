import { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

type ChartCardProps = {
  title: string;
  /** Receives the measured inner width so the SVG can size itself. */
  children: (width: number) => React.ReactNode;
  /** Optional legend/footnote row under the chart. */
  footer?: React.ReactNode;
};

/**
 * Card chrome for a chart: a title, a width-measuring body (SVG charts need an
 * explicit pixel width), and an optional legend footer. The chart isn't rendered
 * until the first layout pass reports a usable width.
 */
export function ChartCard({ title, children, footer }: ChartCardProps) {
  const [width, setWidth] = useState(0);

  const onLayout = (e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.width);
    if (next !== width) setWidth(next);
  };

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {title.toUpperCase()}
      </ThemedText>
      <View style={styles.body} onLayout={onLayout}>
        {width > 0 ? children(width) : null}
      </View>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.two,
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  body: {
    width: '100%',
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
});
