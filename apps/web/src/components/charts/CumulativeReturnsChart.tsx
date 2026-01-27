"use client";

import {
  LineChart,
  Line,
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
  [key: string]: string | number;
}

interface CumulativeReturnsChartProps {
  data: DataPoint[];
  series: string[];
  highlightSeries?: string;
}

const COLORS = [
  "#2563eb",
  "#16a34a",
  "#ea580c",
  "#7c3aed",
  "#db2777",
  "#0891b2",
  "#84cc16",
  "#dc2626",
];

export function CumulativeReturnsChart({
  data,
  series,
  highlightSeries,
}: CumulativeReturnsChartProps) {
  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickFormatter={(date) => {
            const d = new Date(date);
            return `${d.getMonth() + 1}/${d.getFullYear().toString().slice(2)}`;
          }}
        />
        <YAxis tickFormatter={(v) => formatPercent(v, 0)} />
        <Tooltip
          formatter={(value: number) => formatPercent(value)}
          labelFormatter={(label) => new Date(label).toLocaleDateString()}
        />
        <Legend />
        {series.map((name, index) => (
          <Line
            key={name}
            type="monotone"
            dataKey={name}
            stroke={COLORS[index % COLORS.length]}
            strokeWidth={
              highlightSeries === name || name === "Portafolio Óptimo" ? 3 : 1.5
            }
            dot={false}
            name={name}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
