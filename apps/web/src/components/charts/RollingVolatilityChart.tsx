"use client";

import {
  LineChart,
  Line,
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

interface RollingVolatilityChartProps {
  data: DataPoint[];
  series: string[];
  title?: string;
}

export function RollingVolatilityChart({
  data,
  series,
  title,
}: RollingVolatilityChartProps) {
  const t = useTranslations("RollingVolatilityChart");
  const effectiveTitle = title ?? t("title");
  const seriesMeta = series.map((name, i) => ({
    name,
    color: CHART_PALETTE[i % CHART_PALETTE.length].stroke,
  }));

  return (
    <div>
      {effectiveTitle && <h3 className="mb-4 font-display text-lg">{effectiveTitle}</h3>}
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
          <LineChart
            data={data}
            margin={{ top: 8, right: 16, left: 4, bottom: 4 }}
          >
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
              <Line
                key={s.name}
                type="monotone"
                dataKey={s.name}
                stroke={s.color}
                strokeWidth={1.75}
                strokeOpacity={0.9}
                dot={false}
                activeDot={{
                  r: 4,
                  fill: s.color,
                  stroke: "hsl(230 15% 6%)",
                  strokeWidth: 2,
                }}
                name={s.name}
                isAnimationActive
                animationDuration={900}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
