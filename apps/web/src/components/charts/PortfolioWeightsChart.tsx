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
  Legend,
} from "recharts";
import { formatPercent } from "@/lib/utils";

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

const COLORS = [
  "#2563eb",
  "#16a34a",
  "#ea580c",
  "#7c3aed",
  "#db2777",
  "#0891b2",
  "#84cc16",
];

export function PortfolioWeightsChart({
  data,
  comparisonData,
  title = "Pesos del Portafolio",
}: PortfolioWeightsChartProps) {
  // If comparison data is provided, render comparison chart
  if (comparisonData && comparisonData.length > 0) {
    const sortedCompData = [...comparisonData].sort(
      (a, b) => b.optimalWeight - a.optimalWeight
    );

    return (
      <div>
        {title && <h3 className="mb-4 text-lg font-semibold">{title}</h3>}
        <ResponsiveContainer
          width="100%"
          height={Math.max(200, comparisonData.length * 50)}
        >
          <BarChart
            data={sortedCompData}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              type="number"
              domain={[0, 1]}
              tickFormatter={(v) => formatPercent(v, 0)}
            />
            <YAxis type="category" dataKey="name" width={90} />
            <Tooltip
              formatter={(value: number) => formatPercent(value)}
              labelFormatter={(label) => label}
            />
            <Legend />
            <Bar dataKey="optimalWeight" name="Óptimo" fill="#22c55e" />
            <Bar dataKey="userWeight" name="Tu Asignación" fill="#f97316" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Sort by weight descending
  const sortedData = [...data].sort((a, b) => b.weight - a.weight);

  return (
    <div>
      {title && <h3 className="mb-4 text-lg font-semibold">{title}</h3>}
      <ResponsiveContainer width="100%" height={Math.max(200, data.length * 40)}>
        <BarChart
          data={sortedData}
          layout="vertical"
          margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            type="number"
            domain={[0, 1]}
            tickFormatter={(v) => formatPercent(v, 0)}
          />
          <YAxis type="category" dataKey="name" width={90} />
          <Tooltip
            formatter={(value: number) => formatPercent(value)}
            labelFormatter={(label) => label}
          />
          <Bar dataKey="weight" name="Peso">
            {sortedData.map((entry, index) => (
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
