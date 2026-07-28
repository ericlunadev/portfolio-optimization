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
  Legend,
} from "recharts";
import { useTranslations } from "next-intl";
import { formatPercent } from "@/lib/utils";
import { useChartColors } from "./chart-theme";

interface DataPoint {
  date: string;
  cumulative_return: number;
  drawdown: number;
}

interface DrawdownChartProps {
  data: DataPoint[];
  fundName: string;
}

export function DrawdownChart({ data, fundName }: DrawdownChartProps) {
  const t = useTranslations("DrawdownChart");
  const colors = useChartColors();
  // Blue for the return line so red stays exclusively "loss".
  const returnColor =
    colors.palette.find((c) => c.name === "blue")?.stroke ??
    colors.palette[0].stroke;
  return (
    <div className="h-[260px] sm:h-[340px] md:h-[400px]">
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={data}
        margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickFormatter={(date) => {
            const d = new Date(date);
            return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear()}`;
          }}
        />
        <YAxis
          yAxisId="return"
          tickFormatter={(v) => formatPercent(v, 0)}
          orientation="left"
        />
        <YAxis
          yAxisId="drawdown"
          tickFormatter={(v) => formatPercent(v, 0)}
          orientation="right"
        />
        <Tooltip
          formatter={(value: number, name: string) => [
            formatPercent(value),
            name,
          ]}
          labelFormatter={(label) => {
            const d = new Date(label);
            return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear()}`;
          }}
          // Inline styles land on a real DOM node, so CSS variables resolve here.
          contentStyle={{
            background: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            boxShadow: "0 4px 16px hsl(var(--chart-tooltip-shadow))",
          }}
          labelStyle={{ color: "hsl(var(--popover-foreground))", fontWeight: 500 }}
          itemStyle={{ color: "hsl(var(--muted-foreground))" }}
        />
        <Legend />
        <Line
          yAxisId="return"
          type="monotone"
          dataKey="cumulative_return"
          stroke={returnColor}
          strokeWidth={2}
          dot={false}
          name={t("cumulativeReturn")}
        />
        <Area
          yAxisId="drawdown"
          type="monotone"
          dataKey="drawdown"
          fill={`${colors.danger}1f`}
          stroke={colors.danger}
          strokeWidth={1}
          name={t("drawdown")}
        />
      </ComposedChart>
    </ResponsiveContainer>
    </div>
  );
}
