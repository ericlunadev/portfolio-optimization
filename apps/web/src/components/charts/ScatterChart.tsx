"use client";

import { useState } from "react";
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

// Custom dot shape for frontier points — larger hit area for easier hovering
function FrontierDot(props: {
  cx?: number;
  cy?: number;
  payload?: FrontierPoint;
  selectedIndex?: number | null;
  index?: number;
}) {
  const { cx, cy, selectedIndex, index } = props;
  if (cx == null || cy == null) return null;
  const isSelected = selectedIndex != null && index === selectedIndex;
  return (
    <g>
      {isSelected && (
        <circle
          cx={cx}
          cy={cy}
          r={10}
          fill="none"
          stroke="#a78bfa"
          strokeWidth={2}
          strokeDasharray="4 2"
        />
      )}
      <circle cx={cx} cy={cy} r={6} fill="#a78bfa" stroke="#a78bfa" />
    </g>
  );
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
  const [selectedFrontierIndex, setSelectedFrontierIndex] = useState<number | null>(null);

  // Sort frontier by volatility for proper line rendering
  const sortedFrontier = frontier
    ? [...frontier].sort((a, b) => a.vol - b.vol)
    : [];

  const selectedPoint =
    selectedFrontierIndex != null ? sortedFrontier[selectedFrontierIndex] : null;

  const portfolioPoints = [
    ...(optimizedPortfolio ? [optimizedPortfolio] : []),
    ...(userPortfolio ? [userPortfolio] : []),
  ];
  const allPoints = [...data, ...sortedFrontier, ...portfolioPoints];
  const minVol = Math.min(...allPoints.map((p) => p.vol)) * 0.9;
  const maxVol = Math.max(...allPoints.map((p) => p.vol)) * 1.1;
  const minRet = Math.min(...allPoints.map((p) => p.ret)) * 0.9;
  const maxRet = Math.max(...allPoints.map((p) => p.ret)) * 1.1;

  const handleFrontierClick = (_: unknown, index: number) => {
    setSelectedFrontierIndex((prev) => (prev === index ? null : index));
  };

  return (
    <div>
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
                  <div className="rounded-lg border border-border bg-popover p-3 max-w-xs shadow-lg">
                    {point.name && (
                      <p className="font-semibold text-foreground mb-1">{point.name}</p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      Volatilidad: {formatPercent(point.vol)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Rendimiento: {formatPercent(point.ret)}
                    </p>
                    {slope !== null && (
                      <p className="text-sm text-primary mt-1">
                        Pendiente tangente: {slope.toFixed(4)}
                      </p>
                    )}
                    {hasWeights && (
                      <div className="mt-2 pt-2 border-t border-border/50">
                        <p className="text-xs font-semibold text-foreground/80 mb-1">Composición:</p>
                        {frontierTickers!.map((ticker, i) => {
                          const w = point.weights[i] ?? 0;
                          if (Math.abs(w) < 0.001) return null;
                          return (
                            <div key={ticker} className="flex justify-between text-xs text-muted-foreground">
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
              fill="#a78bfa"
              stroke="#a78bfa"
              line
              legendType="plainline"
              name="Frontera Eficiente"
              cursor="pointer"
              onClick={handleFrontierClick}
              shape={<FrontierDot selectedIndex={selectedFrontierIndex} />}
            />
          )}

          <Scatter
            data={data}
            fill="#64748b"
            onClick={(entry) => onPointClick?.(entry.name)}
            cursor={onPointClick ? "pointer" : "default"}
            name="Activos"
          />

          {optimizedPortfolio && (
            <Scatter
              data={[optimizedPortfolio]}
              fill="#34d399"
              shape="star"
              name="Portafolio Óptimo"
            />
          )}

          {userPortfolio && (
            <Scatter
              data={[userPortfolio]}
              fill="#fbbf24"
              shape="diamond"
              name="Tu Portafolio"
            />
          )}
        </ScatterChart>
      </ResponsiveContainer>

      {selectedPoint && frontierTickers && frontierTickers.length > 0 && (
        <div className="mt-4 mx-5 glass-card p-4 border-primary/20">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-foreground">
              Punto seleccionado de la frontera
            </h4>
            <button
              onClick={() => setSelectedFrontierIndex(null)}
              className="text-xs text-primary hover:text-primary/80"
            >
              Cerrar
            </button>
          </div>
          <div className="flex gap-6 mb-3 text-sm text-foreground/80">
            <span>Volatilidad: <strong>{formatPercent(selectedPoint.vol)}</strong></span>
            <span>Rendimiento: <strong>{formatPercent(selectedPoint.ret)}</strong></span>
          </div>
          {selectedPoint.weights && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">Composición:</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-1">
                {frontierTickers.map((ticker, i) => {
                  const w = selectedPoint.weights![i] ?? 0;
                  if (Math.abs(w) < 0.001) return null;
                  return (
                    <div key={ticker} className="flex justify-between text-sm text-foreground/80">
                      <span>{ticker}</span>
                      <span className="font-medium">{formatPercent(w)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
