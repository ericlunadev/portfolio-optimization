"use client";

import { useId } from "react";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useTranslations } from "next-intl";
import { formatPercent } from "@/lib/utils";
import {
  ChartLegend,
  ChartTooltip,
  axisProps,
  formatChartDate,
  useChartColors,
} from "./chart-theme";

interface DataPoint {
  date: string;
  [key: string]: string | number;
}

interface CumulativeReturnsChartProps {
  data: DataPoint[];
  series: string[];
  highlightSeries?: string;
  /**
   * Colour overrides keyed by series name. Series without an entry fall back to
   * the shared palette. Used where a colour already means something elsewhere
   * on the page — a benchmark's line has to match its marker on the scatter.
   */
  seriesColors?: Record<string, string>;
  /**
   * Mount animations rely on requestAnimationFrame, which is suspended in
   * background tabs. Turn them off when the chart is rendered to be captured
   * (PDF export), so it paints its final geometry immediately.
   */
  animate?: boolean;
}

export function CumulativeReturnsChart({
  data,
  series,
  highlightSeries,
  seriesColors,
  animate = true,
}: CumulativeReturnsChartProps) {
  const t = useTranslations("CumulativeReturnsChart");
  const colors = useChartColors();
  // SVG ids live in one document-wide namespace, so two of these charts on the
  // same page would otherwise fight over the same gradient definitions.
  const instanceId = useId().replace(/:/g, "");
  const effectiveHighlight = highlightSeries ?? t("highlightDefault");
  const seriesMeta = series.map((name, i) => {
    const palette = colors.palette[i % colors.palette.length];
    return {
      name,
      color: seriesColors?.[name] ?? palette.stroke,
      gradientId: `cum-grad-${instanceId}-${i}`,
      isHighlight: name === effectiveHighlight,
    };
  });

  return (
    <div>
      <ChartLegend
        items={seriesMeta.map((s) => ({
          label: s.name,
          color: s.color,
          variant: "line" as const,
        }))}
        className="mb-3"
      />
      <div className="h-[260px] sm:h-[340px] md:h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 16, left: 4, bottom: 4 }}
          >
            <defs>
              {seriesMeta.map((s) => (
                <linearGradient
                  key={s.gradientId}
                  id={s.gradientId}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor={s.color}
                    stopOpacity={s.isHighlight ? 0.45 : 0.18}
                  />
                  <stop
                    offset="60%"
                    stopColor={s.color}
                    stopOpacity={s.isHighlight ? 0.12 : 0.04}
                  />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              ))}
              <filter id={`cum-line-glow-${instanceId}`}>
                <feGaussianBlur stdDeviation="2" />
              </filter>
            </defs>
            <CartesianGrid strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatChartDate}
              minTickGap={48}
              {...axisProps}
            />
            <YAxis
              tickFormatter={(v) => formatPercent(v, 0)}
              {...axisProps}
            />
            <Tooltip
              cursor={{
                stroke: colors.cursor,
                strokeDasharray: "3 3",
                strokeWidth: 1,
              }}
              content={({ active, payload, label }) => (
                <ChartTooltip
                  active={active}
                  payload={payload as never}
                  label={label as string | number | undefined}
                  labelFormatter={(l) => formatChartDate(l)}
                  valueFormatter={(v) => formatPercent(v)}
                />
              )}
            />
            {seriesMeta.map((s) => (
              <Area
                key={`area-${s.name}`}
                type="monotone"
                dataKey={s.name}
                stroke="none"
                fill={`url(#${s.gradientId})`}
                connectNulls
                isAnimationActive={animate}
                animationDuration={900}
              />
            ))}
            {seriesMeta.map((s) => (
              <Line
                key={`line-${s.name}`}
                type="monotone"
                dataKey={s.name}
                stroke={s.color}
                strokeWidth={s.isHighlight ? 2.5 : 1.5}
                strokeOpacity={s.isHighlight ? 1 : 0.7}
                dot={false}
                // Markets keep different holiday calendars, so a series can be
                // missing on a date another series trades. Bridge the gap
                // instead of breaking the line at every mismatched holiday.
                connectNulls
                activeDot={{
                  r: s.isHighlight ? 5 : 4,
                  fill: s.color,
                  stroke: colors.markerOutline,
                  strokeWidth: 2,
                }}
                name={s.name}
                isAnimationActive={animate}
                animationDuration={900}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
