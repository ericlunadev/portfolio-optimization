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
import { formatPercent } from "@/lib/utils";

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
  return (
    <ResponsiveContainer width="100%" height={400}>
      <ComposedChart
        data={data}
        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
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
        />
        <Legend />
        <Line
          yAxisId="return"
          type="monotone"
          dataKey="cumulative_return"
          stroke="#2563eb"
          strokeWidth={2}
          dot={false}
          name="Rendimiento Acumulado"
        />
        <Area
          yAxisId="drawdown"
          type="monotone"
          dataKey="drawdown"
          fill="#fee2e2"
          stroke="#dc2626"
          strokeWidth={1}
          name="Drawdown"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
