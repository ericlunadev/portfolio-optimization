"use client";

import { ReactNode, useMemo } from "react";
import { useResolvedTheme } from "@/components/theme/ThemeProvider";
import { useOrganizationBranding } from "@/hooks/useOrganizationBranding";
import { deriveTenantPalette, normalizeAccentHex } from "@/lib/tenant-palette";
import type { ResolvedTheme } from "@/lib/theme";

export interface ChartPaletteEntry {
  name: string;
  /** Line/point colour. */
  stroke: string;
  /** Start of a bar's fill gradient. */
  solid: string;
  /** End of a bar's fill gradient. */
  soft: string;
}

export interface ChartColors {
  palette: ChartPaletteEntry[];
  /** The optimised portfolio — gold. */
  optimal: string;
  /** The user's own allocation — amber. */
  user: string;
  /** The efficient frontier — violet. */
  frontier: string;
  /** Individual assets — neutral. */
  asset: string;
  /**
   * Reference portfolios, handed out in selection order. Deliberately skips the
   * gold, amber and violet already spoken for by the optimal portfolio, the
   * user's allocation and the frontier.
   */
  benchmarks: string[];
  /** Loss / risk — red. */
  danger: string;
  /** Ends of the frontier curve's stroke gradient. */
  frontierFrom: string;
  frontierTo: string;
  /** Ends of the optimal / user weight bar gradients. */
  optimalBar: [string, string];
  userBar: [string, string];
  /** Page colour behind a marker; knocks scatter markers out of the plot. */
  markerOutline: string;
  /** Tooltip crosshair and hover band. */
  cursor: string;
}

/**
 * Series colours, one complete set per appearance — the house sets, used when
 * no tenant accent is in play.
 *
 * These are deliberately plain hex strings rather than `var(--token)`: several
 * call sites build a translucent variant by concatenating a hex alpha pair
 * (`${color}55`), which only works on a real hex value. `deriveTenantPalette`
 * keeps emitting hex for the same reason.
 */
const DARK_COLORS: ChartColors = {
  palette: [
    { name: "gold", stroke: "#e0a861", solid: "#c89853", soft: "#fcd9a8" },
    { name: "emerald", stroke: "#34d399", solid: "#10b981", soft: "#a7f3d0" },
    { name: "violet", stroke: "#a78bfa", solid: "#8b5cf6", soft: "#c4b5fd" },
    { name: "amber", stroke: "#fbbf24", solid: "#f59e0b", soft: "#fde68a" },
    { name: "blue", stroke: "#60a5fa", solid: "#3b82f6", soft: "#bfdbfe" },
    { name: "teal", stroke: "#2dd4bf", solid: "#14b8a6", soft: "#99f6e4" },
    { name: "rose", stroke: "#fb7185", solid: "#f43f5e", soft: "#fda4af" },
    { name: "lime", stroke: "#a3e635", solid: "#84cc16", soft: "#d9f99d" },
  ],
  optimal: "#e0a861",
  user: "#fbbf24",
  frontier: "#a78bfa",
  asset: "#94a3b8",
  benchmarks: ["#60a5fa", "#2dd4bf", "#fb7185", "#a3e635", "#f0abfc", "#38bdf8"],
  danger: "#f87171",
  frontierFrom: "#7c3aed",
  frontierTo: "#22d3ee",
  optimalBar: ["#c89853", "#fcd9a8"],
  userBar: ["#f59e0b", "#fde68a"],
  markerOutline: "#0d0e13",
  cursor: "#3f4457",
};

/** Same hues as the dark set, pushed dark enough to hold up on a white card. */
const LIGHT_COLORS: ChartColors = {
  palette: [
    { name: "gold", stroke: "#a97b2f", solid: "#8a6224", soft: "#d9b57a" },
    { name: "emerald", stroke: "#059669", solid: "#047857", soft: "#6ee7b7" },
    { name: "violet", stroke: "#7c3aed", solid: "#6d28d9", soft: "#a78bfa" },
    { name: "amber", stroke: "#d97706", solid: "#b45309", soft: "#fcd34d" },
    { name: "blue", stroke: "#2563eb", solid: "#1d4ed8", soft: "#93c5fd" },
    { name: "teal", stroke: "#0d9488", solid: "#0f766e", soft: "#5eead4" },
    { name: "rose", stroke: "#e11d48", solid: "#be123c", soft: "#fda4af" },
    { name: "lime", stroke: "#65a30d", solid: "#4d7c0f", soft: "#bef264" },
  ],
  optimal: "#8a6224",
  user: "#b45309",
  frontier: "#6d28d9",
  asset: "#475569",
  benchmarks: ["#2563eb", "#0d9488", "#e11d48", "#65a30d", "#c026d3", "#0284c7"],
  danger: "#dc2626",
  frontierFrom: "#6d28d9",
  frontierTo: "#0e7490",
  optimalBar: ["#8a6224", "#c99a49"],
  userBar: ["#b45309", "#e8a33d"],
  markerOutline: "#ffffff",
  cursor: "#a8a294",
};

const HOUSE_COLORS: Record<ResolvedTheme, ChartColors> = {
  dark: DARK_COLORS,
  light: LIGHT_COLORS,
};

/**
 * The series set for one appearance, given the tenant's accent.
 *
 * A tenant with an accent gets `deriveTenantPalette`'s set: the brand slot and
 * the optimal portfolio take their colour, and every other series is pushed off
 * that hue so the chart stays readable. Without an accent the sets above are
 * returned untouched rather than re-derived from the house gold — the two are
 * close but not identical, and the D2C product (tenant #1, per D5) should not
 * shift colour because branding shipped.
 */
export function resolveChartColors(
  accentHex: string | null | undefined,
  theme: ResolvedTheme
): ChartColors {
  const accent = normalizeAccentHex(accentHex);
  if (!accent) return HOUSE_COLORS[theme];
  return deriveTenantPalette(accent).charts[theme];
}

/** Reactive series colours for the current appearance and tenant. */
export function useChartColors(): ChartColors {
  const theme = useResolvedTheme();
  // A 401 or an absent branding row resolves to null here, which is the
  // no-accent case — signed-out readers and the D2C product both land there.
  const { data: branding } = useOrganizationBranding();
  const accentHex = branding?.accentHex ?? null;

  return useMemo(() => resolveChartColors(accentHex, theme), [accentHex, theme]);
}

/**
 * Axis chrome. Deliberately carries no colours: `globals.css` styles
 * `.recharts-text` and `.recharts-cartesian-grid line` from theme variables,
 * and real CSS outranks the SVG presentation attributes Recharts writes, so a
 * colour here would only be dead weight that fights the stylesheet.
 */
export const axisProps = {
  axisLine: false,
  tickLine: false,
  tick: {
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
    <div className="min-w-[180px] rounded-xl border border-border/60 bg-popover/90 px-3 py-2.5 shadow-2xl shadow-black/10 backdrop-blur-md dark:shadow-black/60">
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
                  className="h-2 w-2 rounded-full ring-2 ring-black/5 dark:ring-white/10"
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

type LegendVariant = "line" | "dot" | "dashed" | "star" | "diamond" | "triangle";

interface ChartLegendItem {
  label: string;
  color: string;
  variant?: LegendVariant;
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
  variant: LegendVariant;
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
  if (variant === "triangle") {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
        <path d="M6 1.5 L11 10.5 L1 10.5 Z" fill={color} />
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
