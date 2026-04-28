"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { useTranslations } from "next-intl";
import { formatPercent } from "@/lib/utils";
import {
  CHART_GRID_STROKE,
  COLOR_DANGER,
  ChartTooltip,
  axisProps,
} from "./chart-theme";

interface DataPoint {
  months: number;
  probability: number;
}

interface ProbNegReturnChartProps {
  data: DataPoint[];
}

export function ProbNegReturnChart({ data }: ProbNegReturnChartProps) {
  const t = useTranslations("ProbNegReturnChart");
  const horizons: { months: number; label: string }[] = [
    { months: 1, label: t("horizon1m") },
    { months: 3, label: t("horizon3m") },
    { months: 12, label: t("horizon1y") },
    { months: 24, label: t("horizon2y") },
  ];

  const maxProb = data?.length
    ? Math.max(...data.map((d) => d.probability))
    : 0;
  const yMax = Math.max(maxProb * 1.2, 0.01);

  if (!data?.length || maxProb < 0.0001) {
    return (
      <div className="flex h-[220px] flex-col items-center justify-center gap-2 text-center text-muted-foreground sm:h-[260px] md:h-[300px]">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/20">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-emerald-400"
            aria-hidden
          >
            <path d="M5 12l5 5L20 7" />
          </svg>
        </div>
        <p>
          {t("emptyMessage")}
          <br />
          <span className="text-xs">{t("emptyThreshold")}</span>
        </p>
      </div>
    );
  }

  return (
    <div className="h-[220px] sm:h-[260px] md:h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 12, right: 18, left: 4, bottom: 18 }}
        >
          <defs>
            <linearGradient id="prob-neg-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLOR_DANGER} stopOpacity={0.45} />
              <stop offset="60%" stopColor={COLOR_DANGER} stopOpacity={0.12} />
              <stop offset="100%" stopColor={COLOR_DANGER} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            stroke={CHART_GRID_STROKE}
            strokeDasharray="2 4"
            vertical={false}
          />
          <XAxis
            dataKey="months"
            label={{
              value: t("axisMonths"),
              position: "insideBottom",
              offset: -10,
              fill: "hsl(230 8% 50%)",
              fontSize: 11,
            }}
            {...axisProps}
          />
          <YAxis
            tickFormatter={(v) => formatPercent(v, 0)}
            domain={[0, yMax]}
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
                labelFormatter={(l) => t("tooltipMonths", { value: String(l) })}
                valueFormatter={(v) => formatPercent(v)}
              />
            )}
          />
          {horizons.filter(
            (h) => data.some((d) => d.months === h.months)
          ).map((h) => (
            <ReferenceLine
              key={h.months}
              x={h.months}
              stroke="hsl(230 12% 22%)"
              strokeDasharray="3 4"
              label={{
                value: h.label,
                position: "top",
                fill: "hsl(230 8% 50%)",
                fontSize: 10,
              }}
            />
          ))}
          <Area
            type="monotone"
            dataKey="probability"
            stroke={COLOR_DANGER}
            strokeWidth={2}
            fill="url(#prob-neg-fill)"
            name={t("seriesProbability")}
            activeDot={{
              r: 5,
              fill: COLOR_DANGER,
              stroke: "hsl(230 15% 6%)",
              strokeWidth: 2,
            }}
            isAnimationActive
            animationDuration={900}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
