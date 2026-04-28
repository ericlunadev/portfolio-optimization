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
  COLOR_OPTIMAL,
  COLOR_USER,
  ChartLegend,
  ChartTooltip,
  axisProps,
} from "./chart-theme";

interface WeightData {
  name: string;
  weight: number;
  ret?: number;
  vol?: number;
}

interface ComparisonWeightData {
  name: string;
  optimalWeight: number;
  userWeight: number;
}

interface PortfolioWeightsChartProps {
  data: WeightData[];
  comparisonData?: ComparisonWeightData[];
  title?: string;
}

export function PortfolioWeightsChart({
  data,
  comparisonData,
  title,
}: PortfolioWeightsChartProps) {
  const t = useTranslations("PortfolioWeightsChart");
  const effectiveTitle = title ?? t("title");
  if (comparisonData && comparisonData.length > 0) {
    const sortedCompData = [...comparisonData].sort(
      (a, b) => b.optimalWeight - a.optimalWeight
    );
    const maxVal = Math.max(
      ...sortedCompData.flatMap((d) => [d.optimalWeight, d.userWeight])
    );
    const domainMax = Math.min(1, Math.max(0.1, maxVal * 1.15));

    return (
      <div>
        <div className="mb-4 flex items-center justify-between gap-4">
          {effectiveTitle && <h3 className="font-display text-lg">{effectiveTitle}</h3>}
          <ChartLegend
            items={[
              { label: t("legendOptimal"), color: COLOR_OPTIMAL, variant: "line" },
              { label: t("legendUser"), color: COLOR_USER, variant: "line" },
            ]}
          />
        </div>
        <ResponsiveContainer
          width="100%"
          height={Math.max(220, comparisonData.length * 56)}
        >
          <BarChart
            data={sortedCompData}
            layout="vertical"
            margin={{ top: 6, right: 28, left: 4, bottom: 6 }}
            barCategoryGap="22%"
          >
            <defs>
              <linearGradient id="bar-optimal" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#c89853" />
                <stop offset="100%" stopColor="#fcd9a8" />
              </linearGradient>
              <linearGradient id="bar-user" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#fde68a" />
              </linearGradient>
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
                  hideLabel={false}
                  valueFormatter={(v) => formatPercent(v)}
                />
              )}
            />
            <Bar
              dataKey="optimalWeight"
              name={t("legendOptimal")}
              fill="url(#bar-optimal)"
              radius={[6, 6, 6, 6]}
              isAnimationActive
              animationDuration={700}
            >
              <LabelList
                dataKey="optimalWeight"
                position="right"
                formatter={(v: number) =>
                  v > 0.005 ? formatPercent(v, 1) : ""
                }
                fill={COLOR_OPTIMAL}
                fontSize={11}
                style={{ fontFamily: "var(--font-mono, monospace)" }}
              />
            </Bar>
            <Bar
              dataKey="userWeight"
              name={t("legendUser")}
              fill="url(#bar-user)"
              radius={[6, 6, 6, 6]}
              isAnimationActive
              animationDuration={700}
            >
              <LabelList
                dataKey="userWeight"
                position="right"
                formatter={(v: number) =>
                  v > 0.005 ? formatPercent(v, 1) : ""
                }
                fill={COLOR_USER}
                fontSize={11}
                style={{ fontFamily: "var(--font-mono, monospace)" }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  const sortedData = [...data].sort((a, b) => b.weight - a.weight);
  const maxWeight = Math.max(...sortedData.map((d) => d.weight));
  const domainMax = Math.min(1, Math.max(0.1, maxWeight * 1.18));

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
                id={`bar-${i}`}
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
            dataKey="weight"
            name={t("barWeight")}
            radius={[6, 6, 6, 6]}
            isAnimationActive
            animationDuration={700}
          >
            {sortedData.map((entry, index) => (
              <Cell
                key={`cell-${entry.name}`}
                fill={`url(#bar-${index % CHART_PALETTE.length})`}
              />
            ))}
            <LabelList
              dataKey="weight"
              position="right"
              formatter={(v: number) =>
                v > 0.005 ? formatPercent(v, 1) : ""
              }
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
