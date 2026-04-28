"use client";

import { ReactNode } from "react";

export const CHART_PALETTE = [
  { name: "gold", stroke: "#e0a861", solid: "#c89853", soft: "#fcd9a8" },
  { name: "emerald", stroke: "#34d399", solid: "#10b981", soft: "#a7f3d0" },
  { name: "violet", stroke: "#a78bfa", solid: "#8b5cf6", soft: "#c4b5fd" },
  { name: "amber", stroke: "#fbbf24", solid: "#f59e0b", soft: "#fde68a" },
  { name: "blue", stroke: "#60a5fa", solid: "#3b82f6", soft: "#bfdbfe" },
  { name: "teal", stroke: "#2dd4bf", solid: "#14b8a6", soft: "#99f6e4" },
  { name: "rose", stroke: "#fb7185", solid: "#f43f5e", soft: "#fda4af" },
  { name: "lime", stroke: "#a3e635", solid: "#84cc16", soft: "#d9f99d" },
];

export const COLOR_OPTIMAL = "#e0a861";
export const COLOR_USER = "#fbbf24";
export const COLOR_FRONTIER = "#a78bfa";
export const COLOR_ASSET = "#94a3b8";
export const COLOR_DANGER = "#f87171";

export const CHART_GRID_STROKE = "hsl(230 12% 16%)";
export const CHART_AXIS_STROKE = "hsl(230 8% 38%)";

export const axisProps = {
  axisLine: false,
  tickLine: false,
  tick: {
    fill: "hsl(230 8% 55%)",
    fontSize: 11,
    fontVariantNumeric: "tabular-nums" as const,
  },
};

export function formatChartDate(input: string | number) {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return String(input);
  return `${String(d.getDate()).padStart(2, "0")}/${String(
    d.getMonth() + 1
  ).padStart(2, "0")}/${d.getFullYear()}`;
}

interface TooltipPayloadEntry {
  name?: string | number;
  value?: number | string | (number | string)[];
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string | number;
  labelFormatter?: (label: string | number, payload?: unknown) => ReactNode;
  valueFormatter?: (
    value: number,
    name: string,
    entry: TooltipPayloadEntry
  ) => ReactNode;
  hideLabel?: boolean;
  extra?: ReactNode;
  [key: string]: unknown;
}

export function ChartTooltip({
  active,
  payload,
  label,
  labelFormatter,
  valueFormatter,
  hideLabel,
  extra,
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="min-w-[180px] rounded-xl border border-border/60 bg-popover/90 px-3 py-2.5 shadow-2xl shadow-black/60 backdrop-blur-md">
      {!hideLabel && label !== undefined && (
        <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {labelFormatter ? labelFormatter(label) : label}
        </div>
      )}
      <div className="space-y-1.5">
        {payload.map((entry, i) => {
          const name = String(entry.name ?? entry.dataKey ?? "");
          const rawVal = Array.isArray(entry.value)
            ? entry.value[0]
            : entry.value;
          const numericVal =
            typeof rawVal === "number" ? rawVal : Number(rawVal);
          const display = valueFormatter
            ? valueFormatter(numericVal, name, entry)
            : numericVal;
          return (
            <div
              key={`${name}-${i}`}
              className="flex items-center justify-between gap-6"
            >
              <div className="flex items-center gap-2 text-xs text-foreground/80">
                <span
                  className="h-2 w-2 rounded-full ring-2 ring-white/10"
                  style={{ background: entry.color ?? "currentColor" }}
                />
                <span className="truncate">{name}</span>
              </div>
              <span className="font-mono text-xs font-medium tabular-nums text-foreground">
                {display}
              </span>
            </div>
          );
        })}
      </div>
      {extra && (
        <div className="mt-2 border-t border-border/50 pt-2">{extra}</div>
      )}
    </div>
  );
}

interface ChartLegendItem {
  label: string;
  color: string;
  variant?: "line" | "dot" | "dashed" | "star" | "diamond";
}

export function ChartLegend({
  items,
  className,
}: {
  items: ChartLegendItem[];
  className?: string;
}) {
  return (
    <div
      className={
        "flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground " +
        (className ?? "")
      }
    >
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <LegendGlyph color={item.color} variant={item.variant ?? "line"} />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function LegendGlyph({
  color,
  variant,
}: {
  color: string;
  variant: "line" | "dot" | "dashed" | "star" | "diamond";
}) {
  if (variant === "dot") {
    return (
      <span
        className="h-2 w-2 rounded-full"
        style={{ background: color, boxShadow: `0 0 8px ${color}55` }}
      />
    );
  }
  if (variant === "dashed") {
    return (
      <svg width="22" height="6" aria-hidden>
        <line
          x1="0"
          y1="3"
          x2="22"
          y2="3"
          stroke={color}
          strokeWidth="2"
          strokeDasharray="4 3"
        />
      </svg>
    );
  }
  if (variant === "star") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
        <path
          d="M7 1l1.7 4 4.3.4-3.3 2.9 1 4.3L7 10.3 3.3 12.6l1-4.3L1 5.4l4.3-.4z"
          fill={color}
        />
      </svg>
    );
  }
  if (variant === "diamond") {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
        <rect
          x="2"
          y="2"
          width="8"
          height="8"
          transform="rotate(45 6 6)"
          fill={color}
        />
      </svg>
    );
  }
  return (
    <span
      className="h-[3px] w-5 rounded-full"
      style={{
        background: color,
        boxShadow: `0 0 8px ${color}55`,
      }}
    />
  );
}

export function ChartGradients({
  series,
  prefix,
}: {
  series: { id: string; color: string }[];
  prefix: string;
}) {
  return (
    <defs>
      {series.map((s) => (
        <linearGradient
          key={s.id}
          id={`${prefix}-${s.id}`}
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop offset="0%" stopColor={s.color} stopOpacity={0.32} />
          <stop offset="60%" stopColor={s.color} stopOpacity={0.08} />
          <stop offset="100%" stopColor={s.color} stopOpacity={0} />
        </linearGradient>
      ))}
      <filter id={`${prefix}-glow`} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}
