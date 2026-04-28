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
} from "recharts";
import { useTranslations } from "next-intl";
import { formatPercent } from "@/lib/utils";
import {
  CHART_GRID_STROKE,
  COLOR_ASSET,
  COLOR_FRONTIER,
  COLOR_OPTIMAL,
  COLOR_USER,
  ChartLegend,
  axisProps,
} from "./chart-theme";

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

function FrontierDot(props: {
  cx?: number;
  cy?: number;
  selectedIndex?: number | null;
  index?: number;
}) {
  const { cx, cy, selectedIndex, index } = props;
  if (cx == null || cy == null) return null;
  const isSelected = selectedIndex != null && index === selectedIndex;
  return (
    <g style={{ cursor: "pointer" }}>
      {isSelected && (
        <circle
          cx={cx}
          cy={cy}
          r={11}
          fill="none"
          stroke={COLOR_FRONTIER}
          strokeOpacity={0.7}
          strokeWidth={1.5}
          strokeDasharray="3 3"
        />
      )}
      <circle
        cx={cx}
        cy={cy}
        r={5}
        fill={COLOR_FRONTIER}
        fillOpacity={0.9}
        stroke="white"
        strokeOpacity={0.15}
        strokeWidth={1}
      />
    </g>
  );
}

function AssetDot(props: { cx?: number; cy?: number; payload?: DataPoint }) {
  const { cx, cy } = props;
  if (cx == null || cy == null) return null;
  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={6}
        fill={COLOR_ASSET}
        fillOpacity={0.18}
      />
      <circle
        cx={cx}
        cy={cy}
        r={3.5}
        fill={COLOR_ASSET}
        stroke="hsl(230 15% 8%)"
        strokeWidth={1.5}
      />
    </g>
  );
}

function OptimalStar(props: { cx?: number; cy?: number }) {
  const { cx, cy } = props;
  if (cx == null || cy == null) return null;
  return (
    <g filter="url(#scatter-glow)">
      <circle cx={cx} cy={cy} r={14} fill={COLOR_OPTIMAL} fillOpacity={0.12} />
      <circle cx={cx} cy={cy} r={9} fill={COLOR_OPTIMAL} fillOpacity={0.22} />
      <path
        d={`M ${cx} ${cy - 7} L ${cx + 2} ${cy - 2.5} L ${cx + 7} ${cy - 2} L ${cx + 3} ${cy + 1.5} L ${cx + 4.5} ${cy + 7} L ${cx} ${cy + 4} L ${cx - 4.5} ${cy + 7} L ${cx - 3} ${cy + 1.5} L ${cx - 7} ${cy - 2} L ${cx - 2} ${cy - 2.5} Z`}
        fill={COLOR_OPTIMAL}
        stroke="hsl(230 15% 6%)"
        strokeWidth={1}
      />
    </g>
  );
}

function UserDiamond(props: { cx?: number; cy?: number }) {
  const { cx, cy } = props;
  if (cx == null || cy == null) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={11} fill={COLOR_USER} fillOpacity={0.12} />
      <rect
        x={cx - 5}
        y={cy - 5}
        width={10}
        height={10}
        transform={`rotate(45 ${cx} ${cy})`}
        fill={COLOR_USER}
        stroke="hsl(230 15% 6%)"
        strokeWidth={1}
      />
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
  showTangentSlope = false,
}: ScatterChartProps) {
  const t = useTranslations("ScatterChart");
  const [selectedFrontierIndex, setSelectedFrontierIndex] = useState<
    number | null
  >(null);

  const sortedFrontier = frontier
    ? [...frontier].sort((a, b) => a.vol - b.vol)
    : [];

  const selectedPoint =
    selectedFrontierIndex != null
      ? sortedFrontier[selectedFrontierIndex]
      : null;

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

  const legendItems: { label: string; color: string; variant?: "line" | "dot" | "dashed" | "star" | "diamond" }[] = [];
  if (sortedFrontier.length > 0) {
    legendItems.push({
      label: t("legendFrontier"),
      color: COLOR_FRONTIER,
      variant: "line",
    });
  }
  legendItems.push({ label: t("legendAssets"), color: COLOR_ASSET, variant: "dot" });
  if (optimizedPortfolio) {
    legendItems.push({
      label: t("legendOptimal"),
      color: COLOR_OPTIMAL,
      variant: "star",
    });
  }
  if (userPortfolio) {
    legendItems.push({
      label: t("legendUser"),
      color: COLOR_USER,
      variant: "diamond",
    });
  }

  return (
    <div>
      <ChartLegend items={legendItems} className="mb-3" />
      <div className="h-[280px] sm:h-[360px] md:h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 12, right: 16, bottom: 24, left: 8 }}>
            <defs>
              <linearGradient id="frontier-stroke" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#7c3aed" />
                <stop offset="50%" stopColor={COLOR_FRONTIER} />
                <stop offset="100%" stopColor="#22d3ee" />
              </linearGradient>
              <filter
                id="scatter-glow"
                x="-100%"
                y="-100%"
                width="300%"
                height="300%"
              >
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <CartesianGrid
              stroke={CHART_GRID_STROKE}
              strokeDasharray="2 4"
              vertical={false}
            />
            <XAxis
              type="number"
              dataKey="vol"
              domain={[minVol, maxVol]}
              tickFormatter={(v) => formatPercent(v, 1)}
              name={t("axisVolatility")}
              label={{
                value: t("axisVolatility"),
                position: "insideBottom",
                offset: -10,
                fill: "hsl(230 8% 50%)",
                fontSize: 11,
              }}
              {...axisProps}
            />
            <YAxis
              type="number"
              dataKey="ret"
              domain={[minRet, maxRet]}
              tickFormatter={(v) => formatPercent(v, 1)}
              name={t("axisReturn")}
              label={{
                value: t("axisReturn"),
                angle: -90,
                position: "insideLeft",
                offset: 14,
                fill: "hsl(230 8% 50%)",
                fontSize: 11,
              }}
              {...axisProps}
            />
            <ZAxis range={[60, 60]} />
            <Tooltip
              cursor={{ stroke: "hsl(230 12% 25%)", strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0].payload as FrontierPoint &
                  DataPoint &
                  PortfolioPoint;
                const slope = showTangentSlope
                  ? computeTangentSlope(point, sortedFrontier)
                  : null;
                const hasWeights =
                  point.weights &&
                  Array.isArray(point.weights) &&
                  frontierTickers &&
                  frontierTickers.length > 0;
                return (
                  <div className="min-w-[200px] max-w-xs rounded-xl border border-border/60 bg-popover/90 px-3 py-2.5 shadow-2xl shadow-black/60 backdrop-blur-md">
                    {point.name && (
                      <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                        {point.name}
                      </div>
                    )}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-6 text-xs">
                        <span className="text-foreground/70">{t("tooltipVolatility")}</span>
                        <span className="font-mono font-medium tabular-nums">
                          {formatPercent(point.vol)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-6 text-xs">
                        <span className="text-foreground/70">{t("tooltipReturn")}</span>
                        <span className="font-mono font-medium tabular-nums">
                          {formatPercent(point.ret)}
                        </span>
                      </div>
                      {slope !== null && (
                        <div className="flex items-center justify-between gap-6 text-xs">
                          <span className="text-primary/80">{t("tooltipSlope")}</span>
                          <span className="font-mono font-medium tabular-nums text-primary">
                            {slope.toFixed(4)}
                          </span>
                        </div>
                      )}
                    </div>
                    {hasWeights && (
                      <div className="mt-2 border-t border-border/50 pt-2">
                        <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                          {t("composition")}
                        </div>
                        <div className="space-y-0.5">
                          {frontierTickers!.map((ticker, i) => {
                            const w = point.weights![i] ?? 0;
                            if (Math.abs(w) < 0.001) return null;
                            return (
                              <div
                                key={ticker}
                                className="flex justify-between text-[11px] text-foreground/75"
                              >
                                <span>{ticker}</span>
                                <span className="font-mono font-medium tabular-nums">
                                  {formatPercent(w)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              }}
            />

            {sortedFrontier.length > 0 && (
              <Scatter
                data={sortedFrontier}
                fill={COLOR_FRONTIER}
                stroke="url(#frontier-stroke)"
                line={{ strokeWidth: 2.5, stroke: "url(#frontier-stroke)" }}
                lineType="joint"
                name={t("legendFrontier")}
                onClick={handleFrontierClick}
                shape={<FrontierDot selectedIndex={selectedFrontierIndex} />}
                isAnimationActive
                animationDuration={700}
              />
            )}

            <Scatter
              data={data}
              fill={COLOR_ASSET}
              onClick={(entry) => onPointClick?.(entry.name)}
              cursor={onPointClick ? "pointer" : "default"}
              name={t("legendAssets")}
              shape={<AssetDot />}
              isAnimationActive
              animationDuration={700}
            />

            {optimizedPortfolio && (
              <Scatter
                data={[optimizedPortfolio]}
                fill={COLOR_OPTIMAL}
                shape={<OptimalStar />}
                name={t("legendOptimal")}
                isAnimationActive
                animationDuration={900}
              />
            )}

            {userPortfolio && (
              <Scatter
                data={[userPortfolio]}
                fill={COLOR_USER}
                shape={<UserDiamond />}
                name={t("legendUser")}
                isAnimationActive
                animationDuration={900}
              />
            )}
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {selectedPoint && frontierTickers && frontierTickers.length > 0 && (
        <div className="mt-4 rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  background: COLOR_FRONTIER,
                  boxShadow: `0 0 10px ${COLOR_FRONTIER}`,
                }}
              />
              <h4 className="text-sm font-semibold text-foreground">
                {t("selectedPointTitle")}
              </h4>
            </div>
            <button
              onClick={() => setSelectedFrontierIndex(null)}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("close")}
            </button>
          </div>
          <div className="mb-3 flex gap-6 text-sm text-foreground/80">
            <span>
              {t("tooltipVolatility")}:{" "}
              <strong className="font-mono tabular-nums">
                {formatPercent(selectedPoint.vol)}
              </strong>
            </span>
            <span>
              {t("tooltipReturn")}:{" "}
              <strong className="font-mono tabular-nums">
                {formatPercent(selectedPoint.ret)}
              </strong>
            </span>
          </div>
          {selectedPoint.weights && (
            <div>
              <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                {t("composition")}
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3 md:grid-cols-4">
                {frontierTickers.map((ticker, i) => {
                  const w = selectedPoint.weights![i] ?? 0;
                  if (Math.abs(w) < 0.001) return null;
                  return (
                    <div
                      key={ticker}
                      className="flex justify-between text-sm text-foreground/80"
                    >
                      <span>{ticker}</span>
                      <span className="font-mono font-medium tabular-nums">
                        {formatPercent(w)}
                      </span>
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
