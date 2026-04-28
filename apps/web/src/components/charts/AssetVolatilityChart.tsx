"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";
import { useTranslations } from "next-intl";
import { formatPercent } from "@/lib/utils";
import {
  CHART_GRID_STROKE,
  CHART_PALETTE,
  ChartTooltip,
  axisProps,
} from "./chart-theme";

interface AssetVolatilityData {
  name: string;
  volatility: number;
}

interface AssetVolatilityChartProps {
  data: AssetVolatilityData[];
  title?: string;
}

export function AssetVolatilityChart({
  data,
  title,
}: AssetVolatilityChartProps) {
  const t = useTranslations("AssetVolatilityChart");
  const effectiveTitle = title ?? t("title");
  const sortedData = [...data].sort((a, b) => b.volatility - a.volatility);
  const maxVol = Math.max(...data.map((d) => d.volatility));
  const domainMax = Math.ceil(maxVol * 10) / 10 + 0.05;

  return (
    <div>
      {effectiveTitle && <h3 className="mb-4 font-display text-lg">{effectiveTitle}</h3>}
      <ResponsiveContainer
        width="100%"
        height={Math.max(220, data.length * 44)}
      >
        <BarChart
          data={sortedData}
          layout="vertical"
          margin={{ top: 6, right: 32, left: 4, bottom: 6 }}
          barCategoryGap="20%"
        >
          <defs>
            {CHART_PALETTE.map((c, i) => (
              <linearGradient
                key={c.name}
                id={`vol-bar-${i}`}
                x1="0"
                y1="0"
                x2="1"
                y2="0"
              >
                <stop offset="0%" stopColor={c.solid} stopOpacity={0.95} />
                <stop offset="100%" stopColor={c.soft} stopOpacity={0.95} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid
            stroke={CHART_GRID_STROKE}
            strokeDasharray="2 4"
            horizontal={false}
          />
          <XAxis
            type="number"
            domain={[0, domainMax]}
            tickFormatter={(v) => formatPercent(v, 0)}
            {...axisProps}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={86}
            {...axisProps}
            tick={{ ...axisProps.tick, fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: "hsl(230 12% 16% / 0.5)" }}
            content={({ active, payload, label }) => (
              <ChartTooltip
                active={active}
                payload={payload as never}
                label={label as string | number | undefined}
                valueFormatter={(v) => formatPercent(v)}
              />
            )}
          />
          <Bar
            dataKey="volatility"
            name={t("barVolatility")}
            radius={[6, 6, 6, 6]}
            isAnimationActive
            animationDuration={700}
          >
            {sortedData.map((entry, index) => (
              <Cell
                key={`cell-${entry.name}`}
                fill={`url(#vol-bar-${index % CHART_PALETTE.length})`}
              />
            ))}
            <LabelList
              dataKey="volatility"
              position="right"
              formatter={(v: number) => formatPercent(v, 1)}
              fill="hsl(40 6% 80%)"
              fontSize={11}
              style={{ fontFamily: "var(--font-mono, monospace)" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
