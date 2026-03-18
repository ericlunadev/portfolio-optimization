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
  weights?: number[];
}

interface PortfolioPoint {
  name: string;
  vol: number;
  ret: number;
}

interface ScatterChartProps {
  data: DataPoint[];
  frontier?: FrontierPoint[];
  frontierTickers?: string[];
  optimizedPortfolio?: PortfolioPoint | null;
  userPortfolio?: PortfolioPoint | null;
  onPointClick?: (name: string) => void;
  showLabels?: boolean;
  showTangentSlope?: boolean;
}

function computeTangentSlope(
  point: FrontierPoint,
  sortedFrontier: FrontierPoint[]
): number | null {
  const idx = sortedFrontier.findIndex(
    (p) => p.vol === point.vol && p.ret === point.ret
  );
  if (idx === -1) return null;

  if (sortedFrontier.length < 2) return null;

  if (idx === 0) {
    const p0 = sortedFrontier[0];
    const p1 = sortedFrontier[1];
    return (p1.ret - p0.ret) / (p1.vol - p0.vol);
  }
  if (idx === sortedFrontier.length - 1) {
    const pPrev = sortedFrontier[idx - 1];
    const pCurr = sortedFrontier[idx];
    return (pCurr.ret - pPrev.ret) / (pCurr.vol - pPrev.vol);
  }

  const pPrev = sortedFrontier[idx - 1];
  const pNext = sortedFrontier[idx + 1];
  return (pNext.ret - pPrev.ret) / (pNext.vol - pPrev.vol);
}

export function RiskReturnScatterChart({
  data,
  frontier,
  frontierTickers,
  optimizedPortfolio,
  userPortfolio,
  onPointClick,
  showLabels = true,
  showTangentSlope = false,
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
          content={({ active, payload }) => {
            if (active && payload && payload.length) {
              const point = payload[0].payload;
              const slope =
                showTangentSlope
                  ? computeTangentSlope(point, sortedFrontier)
                  : null;
              const hasWeights =
                point.weights &&
                Array.isArray(point.weights) &&
                frontierTickers &&
                frontierTickers.length > 0;
              return (
                <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 max-w-xs">
                  {point.name && (
                    <p className="font-semibold text-gray-900 mb-1">{point.name}</p>
                  )}
                  <p className="text-sm text-gray-600">
                    Volatilidad: {formatPercent(point.vol)}
                  </p>
                  <p className="text-sm text-gray-600">
                    Rendimiento: {formatPercent(point.ret)}
                  </p>
                  {slope !== null && (
                    <p className="text-sm text-blue-600 mt-1">
                      Pendiente tangente: {slope.toFixed(4)}
                    </p>
                  )}
                  {hasWeights && (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <p className="text-xs font-semibold text-gray-700 mb-1">Composición:</p>
                      {frontierTickers!.map((ticker, i) => {
                        const w = point.weights[i] ?? 0;
                        if (Math.abs(w) < 0.001) return null;
                        return (
                          <div key={ticker} className="flex justify-between text-xs text-gray-600">
                            <span>{ticker}</span>
                            <span className="ml-3 font-medium">{formatPercent(w)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }
            return null;
          }}
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
