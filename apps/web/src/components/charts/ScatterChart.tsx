"use client";

import {
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { formatPercent } from "@/lib/utils";

interface DataPoint {
  name: string;
  vol: number;
  ret: number;
  weight?: number;
}

interface FrontierPoint {
  vol: number;
  ret: number;
}

interface PortfolioPoint {
  name: string;
  vol: number;
  ret: number;
}

interface ScatterChartProps {
  data: DataPoint[];
  frontier?: FrontierPoint[];
  optimizedPortfolio?: PortfolioPoint | null;
  userPortfolio?: PortfolioPoint | null;
  onPointClick?: (name: string) => void;
  showLabels?: boolean;
}

export function RiskReturnScatterChart({
  data,
  frontier,
  optimizedPortfolio,
  userPortfolio,
  onPointClick,
  showLabels = true,
}: ScatterChartProps) {
  // Sort frontier by volatility for proper line rendering
  const sortedFrontier = frontier
    ? [...frontier].sort((a, b) => a.vol - b.vol)
    : [];

  const portfolioPoints = [
    ...(optimizedPortfolio ? [optimizedPortfolio] : []),
    ...(userPortfolio ? [userPortfolio] : []),
  ];
  const allPoints = [...data, ...sortedFrontier, ...portfolioPoints];
  const minVol = Math.min(...allPoints.map((p) => p.vol)) * 0.9;
  const maxVol = Math.max(...allPoints.map((p) => p.vol)) * 1.1;
  const minRet = Math.min(...allPoints.map((p) => p.ret)) * 0.9;
  const maxRet = Math.max(...allPoints.map((p) => p.ret)) * 1.1;

  return (
    <ResponsiveContainer width="100%" height={400}>
      <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          type="number"
          dataKey="vol"
          domain={[minVol, maxVol]}
          tickFormatter={(v) => formatPercent(v, 1)}
          name="Volatilidad"
          label={{ value: "Volatilidad", position: "bottom", offset: 0 }}
        />
        <YAxis
          type="number"
          dataKey="ret"
          domain={[minRet, maxRet]}
          tickFormatter={(v) => formatPercent(v, 1)}
          name="Rendimiento"
          label={{ value: "Rendimiento", angle: -90, position: "left", offset: 10 }}
        />
        <ZAxis range={[60, 60]} />
        <Tooltip
          formatter={(value: number) => formatPercent(value)}
          labelFormatter={(_, payload) =>
            payload?.[0]?.payload?.name || "Punto"
          }
        />
        <Legend verticalAlign="top" height={36} />

        {sortedFrontier.length > 0 && (
          <Scatter
            data={sortedFrontier}
            fill="#8884d8"
            stroke="#8884d8"
            line
            shape="circle"
            legendType="plainline"
            name="Frontera Eficiente"
          />
        )}

        <Scatter
          data={data}
          fill="#94a3b8"
          onClick={(entry) => onPointClick?.(entry.name)}
          cursor={onPointClick ? "pointer" : "default"}
          name="Activos"
        />

        {optimizedPortfolio && (
          <Scatter
            data={[optimizedPortfolio]}
            fill="#22c55e"
            shape="star"
            name="Portafolio Óptimo"
          />
        )}

        {userPortfolio && (
          <Scatter
            data={[userPortfolio]}
            fill="#f97316"
            shape="diamond"
            name="Tu Portafolio"
          />
        )}
      </ScatterChart>
    </ResponsiveContainer>
  );
}
