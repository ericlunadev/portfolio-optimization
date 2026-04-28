"use client";

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
  CHART_GRID_STROKE,
  CHART_PALETTE,
  ChartLegend,
  ChartTooltip,
  axisProps,
  formatChartDate,
} from "./chart-theme";

interface DataPoint {
  date: string;
  [key: string]: string | number;
}

interface CumulativeReturnsChartProps {
  data: DataPoint[];
  series: string[];
  highlightSeries?: string;
}

export function CumulativeReturnsChart({
  data,
  series,
  highlightSeries,
}: CumulativeReturnsChartProps) {
  const t = useTranslations("CumulativeReturnsChart");
  const effectiveHighlight = highlightSeries ?? t("highlightDefault");
  const seriesMeta = series.map((name, i) => {
    const palette = CHART_PALETTE[i % CHART_PALETTE.length];
    return {
      name,
      color: palette.stroke,
      gradientId: `cum-grad-${i}`,
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
              <filter id="cum-line-glow">
                <feGaussianBlur stdDeviation="2" />
              </filter>
            </defs>
            <CartesianGrid
              stroke={CHART_GRID_STROKE}
              strokeDasharray="2 4"
              vertical={false}
            />
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
                stroke: "hsl(230 12% 28%)",
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
                isAnimationActive
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
                activeDot={{
                  r: s.isHighlight ? 5 : 4,
                  fill: s.color,
                  stroke: "hsl(230 15% 6%)",
                  strokeWidth: 2,
                }}
                name={s.name}
                isAnimationActive
                animationDuration={900}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
