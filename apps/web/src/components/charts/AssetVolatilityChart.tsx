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
} from "recharts";
import { formatPercent } from "@/lib/utils";

interface AssetVolatilityData {
  name: string;
  volatility: number;
}

interface AssetVolatilityChartProps {
  data: AssetVolatilityData[];
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
];

export function AssetVolatilityChart({
  data,
  title = "Volatilidad por Activo",
}: AssetVolatilityChartProps) {
  // Sort by volatility descending
  const sortedData = [...data].sort((a, b) => b.volatility - a.volatility);

  // Calculate max volatility for domain
  const maxVol = Math.max(...data.map((d) => d.volatility));
  const domainMax = Math.ceil(maxVol * 10) / 10 + 0.05;

  return (
    <div>
      {title && <h3 className="mb-4 font-display text-lg">{title}</h3>}
      <ResponsiveContainer width="100%" height={Math.max(200, data.length * 40)}>
        <BarChart
          data={sortedData}
          layout="vertical"
          margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            type="number"
            domain={[0, domainMax]}
            tickFormatter={(v) => formatPercent(v, 0)}
          />
          <YAxis type="category" dataKey="name" width={90} />
          <Tooltip
            formatter={(value: number) => formatPercent(value)}
            labelFormatter={(label) => label}
          />
          <Bar dataKey="volatility" name="Volatilidad">
            {sortedData.map((_, index) => (
              <Cell
                key={`cell-${index}`}
                fill={COLORS[index % COLORS.length]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
