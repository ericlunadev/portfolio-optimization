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

interface RollingVolatilityChartProps {
  data: DataPoint[];
  series: string[];
  title?: string;
}

const COLORS = [
  "#5b8def",
  "#34d399",
  "#fbbf24",
  "#f87171",
  "#a78bfa",
  "#2dd4bf",
  "#fb7185",
  "#a3e635",
];

export function RollingVolatilityChart({
  data,
  series,
  title = "Volatilidad Histórica (12 meses)",
}: RollingVolatilityChartProps) {
  return (
    <div>
      {title && <h3 className="mb-4 font-display text-lg">{title}</h3>}
      <div className="h-[260px] sm:h-[340px] md:h-[400px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickFormatter={(date) => {
              const d = new Date(date);
              return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear()}`;
            }}
          />
          <YAxis tickFormatter={(v) => formatPercent(v, 0)} />
          <Tooltip
            formatter={(value: number) => formatPercent(value)}
            labelFormatter={(label) => {
              const d = new Date(label);
              return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear()}`;
            }}
            contentStyle={{
              background: "hsl(230 15% 10%)",
              border: "1px solid hsl(230 12% 20%)",
              borderRadius: "8px",
              boxShadow: "0 4px 16px rgba(0, 0, 0, 0.5)",
            }}
            labelStyle={{ color: "hsl(40 6% 90%)", fontWeight: 500 }}
            itemStyle={{ color: "hsl(40 6% 75%)" }}
          />
          <Legend />
          {series.map((name, index) => (
            <Line
              key={name}
              type="monotone"
              dataKey={name}
              stroke={COLORS[index % COLORS.length]}
              strokeWidth={1.5}
              dot={false}
              name={name}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}
