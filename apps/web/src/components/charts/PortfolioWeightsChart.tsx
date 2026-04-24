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
  "#5b8def",
  "#34d399",
  "#fbbf24",
  "#f87171",
  "#a78bfa",
  "#2dd4bf",
  "#fb7185",
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
        {title && <h3 className="mb-4 font-display text-lg">{title}</h3>}
        <ResponsiveContainer
          width="100%"
          height={Math.max(200, comparisonData.length * 50)}
        >
          <BarChart
            data={sortedCompData}
            layout="vertical"
            margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              type="number"
              domain={[0, 1]}
              tickFormatter={(v) => formatPercent(v, 0)}
            />
            <YAxis type="category" dataKey="name" width={70} />
            <Tooltip
              formatter={(value: number) => formatPercent(value)}
              labelFormatter={(label) => label}
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
            <Bar dataKey="optimalWeight" name="Óptimo" fill="#34d399" />
            <Bar dataKey="userWeight" name="Tu Asignación" fill="#fbbf24" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Sort by weight descending
  const sortedData = [...data].sort((a, b) => b.weight - a.weight);

  return (
    <div>
      {title && <h3 className="mb-4 font-display text-lg">{title}</h3>}
      <ResponsiveContainer width="100%" height={Math.max(200, data.length * 40)}>
        <BarChart
          data={sortedData}
          layout="vertical"
          margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            type="number"
            domain={[0, 1]}
            tickFormatter={(v) => formatPercent(v, 0)}
          />
          <YAxis type="category" dataKey="name" width={70} />
          <Tooltip
            formatter={(value: number) => formatPercent(value)}
            labelFormatter={(label) => label}
            contentStyle={{
              background: "hsl(230 15% 10%)",
              border: "1px solid hsl(230 12% 20%)",
              borderRadius: "8px",
              boxShadow: "0 4px 16px rgba(0, 0, 0, 0.5)",
            }}
            labelStyle={{ color: "hsl(40 6% 90%)", fontWeight: 500 }}
            itemStyle={{ color: "hsl(40 6% 75%)" }}
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
