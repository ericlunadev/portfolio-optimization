import { G, Line, Rect, Svg, Text as SvgText } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';
import type { OptimizationWeight } from '@/lib/api/optimization';
import { formatPercent } from '@/lib/format';
import { linearScale, niceTicks } from '@/components/optimizer/charts/chart-scales';

type WeightsBarChartProps = {
  weights: OptimizationWeight[];
  width: number;
};

const ROW_HEIGHT = 28;
const TOP_PAD = 8;
const BOTTOM_PAD = 18;
const LABEL_WIDTH = 96;
const VALUE_WIDTH = 52;

/**
 * Horizontal bar chart of portfolio allocations (one bar per asset, sorted by
 * weight). Built on react-native-svg from the optimize response — no extra API
 * call. Weights can be negative (short positions), so bars grow from a zero
 * baseline in either direction.
 */
export function WeightsBarChart({ weights, width }: WeightsBarChartProps) {
  const theme = useTheme();

  const rows = [...weights].sort((a, b) => b.weight - a.weight);
  const plotLeft = LABEL_WIDTH;
  const plotRight = width - VALUE_WIDTH;
  const height = TOP_PAD + rows.length * ROW_HEIGHT + BOTTOM_PAD;

  const min = Math.min(0, ...rows.map((r) => r.weight));
  const max = Math.max(0, ...rows.map((r) => r.weight));
  const ticks = niceTicks(min, max, 4);
  const x = linearScale(ticks[0], ticks[ticks.length - 1], plotLeft, plotRight);
  const zeroX = x(0);

  return (
    <Svg width={width} height={height}>
      {/* Vertical gridlines + axis tick labels */}
      {ticks.map((t) => {
        const tx = x(t);
        return (
          <G key={`tick-${t}`}>
            <Line
              x1={tx}
              y1={TOP_PAD}
              x2={tx}
              y2={TOP_PAD + rows.length * ROW_HEIGHT}
              stroke={theme.border}
              strokeWidth={t === 0 ? 1 : HAIRLINE}
            />
            <SvgText
              x={tx}
              y={height - 4}
              fill={theme.textSecondary}
              fontSize={10}
              textAnchor="middle">
              {formatPercent(t, 0)}
            </SvgText>
          </G>
        );
      })}

      {rows.map((row, i) => {
        const rowY = TOP_PAD + i * ROW_HEIGHT;
        const barY = rowY + 5;
        const barH = ROW_HEIGHT - 12;
        const valueX = x(row.weight);
        const barX = Math.min(zeroX, valueX);
        const barW = Math.max(1, Math.abs(valueX - zeroX));
        const negative = row.weight < 0;
        return (
          <G key={row.fund_id}>
            <SvgText
              x={plotLeft - 8}
              y={rowY + ROW_HEIGHT / 2 + 3}
              fill={theme.text}
              fontSize={11}
              textAnchor="end">
              {truncate(row.fund_name, 14)}
            </SvgText>
            <Rect
              x={barX}
              y={barY}
              width={barW}
              height={barH}
              rx={3}
              fill={negative ? theme.negative : theme.tint}
            />
            <SvgText
              x={plotRight + 6}
              y={rowY + ROW_HEIGHT / 2 + 3}
              fill={theme.textSecondary}
              fontSize={11}
              textAnchor="start">
              {formatPercent(row.weight)}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

/** Thin gridline stroke (react-native-svg's strokeWidth wants a number). */
const HAIRLINE = 0.5;

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
