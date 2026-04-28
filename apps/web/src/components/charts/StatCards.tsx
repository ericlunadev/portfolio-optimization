"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: "gold" | "emerald" | "violet" | "rose" | "neutral";
  icon?: ReactNode;
  trend?: {
    value: ReactNode;
    direction: "up" | "down" | "flat";
  };
}

const ACCENT_STYLES: Record<
  NonNullable<StatCardProps["accent"]>,
  { glow: string; valueClass: string; ring: string }
> = {
  gold: {
    glow: "from-[#e0a861]/30 to-transparent",
    valueClass: "text-[#fcd9a8]",
    ring: "ring-[#e0a861]/20",
  },
  emerald: {
    glow: "from-emerald-400/25 to-transparent",
    valueClass: "text-emerald-300",
    ring: "ring-emerald-400/20",
  },
  violet: {
    glow: "from-violet-400/25 to-transparent",
    valueClass: "text-violet-300",
    ring: "ring-violet-400/20",
  },
  rose: {
    glow: "from-rose-400/25 to-transparent",
    valueClass: "text-rose-300",
    ring: "ring-rose-400/20",
  },
  neutral: {
    glow: "from-slate-400/15 to-transparent",
    valueClass: "text-foreground",
    ring: "ring-border/40",
  },
};

export function StatCard({
  label,
  value,
  hint,
  accent = "neutral",
  icon,
  trend,
}: StatCardProps) {
  const a = ACCENT_STYLES[accent];
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border/50 bg-card/40 p-4 ring-1 ring-inset backdrop-blur",
        a.ring
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-gradient-to-br opacity-50 blur-2xl transition-opacity duration-500 group-hover:opacity-80",
          a.glow
        )}
        aria-hidden
      />
      <div className="relative flex items-start justify-between">
        <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </div>
        {icon && (
          <div className="text-muted-foreground/60 transition-colors group-hover:text-foreground/70">
            {icon}
          </div>
        )}
      </div>
      <div className="relative mt-2 flex items-baseline gap-2">
        <div
          className={cn(
            "font-display text-2xl tabular-nums leading-tight md:text-[28px]",
            a.valueClass
          )}
        >
          {value}
        </div>
        {trend && (
          <span
            className={cn(
              "text-xs font-medium tabular-nums",
              trend.direction === "up" && "text-emerald-400",
              trend.direction === "down" && "text-rose-400",
              trend.direction === "flat" && "text-muted-foreground"
            )}
          >
            {trend.direction === "up" && "▲ "}
            {trend.direction === "down" && "▼ "}
            {trend.value}
          </span>
        )}
      </div>
      {hint && (
        <div className="relative mt-1 text-xs text-muted-foreground">
          {hint}
        </div>
      )}
    </div>
  );
}

export function StatCardGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:gap-4">
      {children}
    </div>
  );
}
