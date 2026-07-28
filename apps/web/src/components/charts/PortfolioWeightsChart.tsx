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
  ChartLegend,
  ChartTooltip,
  axisProps,
  useChartColors,
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
  /**
   * Mount animations rely on requestAnimationFrame, which is suspended in
   * background tabs. Turn them off when the chart is rendered to be captured
   * (PDF export), so it paints its final geometry immediately.
   */
  animate?: boolean;
}

export function PortfolioWeightsChart({
  data,
  comparisonData,
  title,
  animate = true,
}: PortfolioWeightsChartProps) {
  const t = useTranslations("PortfolioWeightsChart");
  const colors = useChartColors();
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
              { label: t("legendOptimal"), color: colors.optimal, variant: "line" },
              { label: t("legendUser"), color: colors.user, variant: "line" },
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
                <stop offset="0%" stopColor={colors.optimalBar[0]} />
                <stop offset="100%" stopColor={colors.optimalBar[1]} />
              </linearGradient>
              <linearGradient id="bar-user" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={colors.userBar[0]} />
                <stop offset="100%" stopColor={colors.userBar[1]} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 4" horizontal={false} />
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
              cursor={{ fill: colors.cursor, fillOpacity: 0.25 }}
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
              isAnimationActive={animate}
              animationDuration={700}
            >
              <LabelList
                dataKey="optimalWeight"
                position="right"
                formatter={(v: number) =>
                  v > 0.005 ? formatPercent(v, 1) : ""
                }
                fontSize={11}
                style={{ fontFamily: "var(--font-mono, monospace)" }}
              />
            </Bar>
            <Bar
              dataKey="userWeight"
              name={t("legendUser")}
              fill="url(#bar-user)"
              radius={[6, 6, 6, 6]}
              isAnimationActive={animate}
              animationDuration={700}
            >
              <LabelList
                dataKey="userWeight"
                position="right"
                formatter={(v: number) =>
                  v > 0.005 ? formatPercent(v, 1) : ""
                }
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
            {colors.palette.map((c, i) => (
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
          <CartesianGrid strokeDasharray="2 4" horizontal={false} />
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
            isAnimationActive={animate}
            animationDuration={700}
          >
            {sortedData.map((entry, index) => (
              <Cell
                key={`cell-${entry.name}`}
                fill={`url(#bar-${index % colors.palette.length})`}
              />
            ))}
            <LabelList
              dataKey="weight"
              position="right"
              formatter={(v: number) =>
                v > 0.005 ? formatPercent(v, 1) : ""
              }
              fontSize={11}
              style={{ fontFamily: "var(--font-mono, monospace)" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
