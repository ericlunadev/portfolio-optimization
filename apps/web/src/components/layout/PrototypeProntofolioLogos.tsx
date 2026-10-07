"use client";

/**
 * PROTOTYPE — throwaway. Delete once a logo is picked (see NOTES in the PR).
 *
 * Question: what should the Prontofolio logo look like?
 * Five radically different concepts, rendered in place of the real wordmark in
 * the Sidebar (full) and the phone Header (compact), switched with `?logo=`.
 * No `?logo=` param → the real tenant wordmark renders, unchanged.
 *
 * "Prontofolio" is hardcoded here on purpose: the brand is tenant data
 * (CLAUDE.md), and the winner gets folded into `organization_branding` /
 * `logoUrl`, not into this file.
 */

import { Suspense, useId, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { PrototypeSwitcher } from "@/components/ui/PrototypeSwitcher";

const NAME = "Prontofolio";

// --- A: Frontier — a "P" whose bowl is the efficient frontier ---------------
function FrontierMark({ className }: { className?: string }) {
  // Sidebar and Header both mount this; a shared id resolves to the hidden copy.
  const id = useId();
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="4" y1="30" x2="28" y2="2">
          <stop offset="0" style={{ stopColor: "hsl(var(--gradient-gold-from))" }} />
          <stop offset="1" style={{ stopColor: "hsl(var(--gradient-gold-to))" }} />
        </linearGradient>
      </defs>
      {/* stem */}
      <path d="M8 29V4" stroke={`url(#${id})`} strokeWidth="3.2" strokeLinecap="round" fill="none" />
      {/* frontier bowl: concave curve from the stem's foot up and back */}
      <path
        d="M8 19 C 13 19, 24 17, 24 11 C 24 6, 17 4, 8 4"
        stroke={`url(#${id})`}
        strokeWidth="3.2"
        strokeLinecap="round"
        fill="none"
      />
      {/* the optimal portfolio */}
      <circle cx="23.6" cy="12.6" r="3" className="fill-foreground" />
    </svg>
  );
}

function FrontierFull() {
  return (
    <div className="flex items-center gap-2.5">
      <FrontierMark className="h-8 w-8 shrink-0" />
      <span className="font-display text-2xl font-semibold tracking-tight text-foreground">
        {NAME}
      </span>
    </div>
  );
}
function FrontierCompact() {
  return (
    <div className="flex items-center gap-2">
      <FrontierMark className="h-7 w-7 shrink-0" />
    </div>
  );
}

// --- B: Two-tone — pure type, no symbol ------------------------------------
function TwoToneFull() {
  return (
    <span className="font-display text-[1.7rem] leading-none tracking-tight">
      <span className="font-light text-foreground/70">pronto</span>
      <span className="font-bold text-gradient-gold">folio</span>
    </span>
  );
}
function TwoToneCompact() {
  return (
    <span className="font-display text-base leading-none tracking-tight">
      <span className="font-light text-foreground/70">pronto</span>
      <span className="font-bold text-gradient-gold">folio</span>
    </span>
  );
}

// --- C: Allocation — a weighted donut, lowercase name ----------------------
// Slices: 45%, 30%, 15%, 10%. Circumference of r=12 ≈ 75.4.
const SLICES = [
  { pct: 0.45, cls: "stroke-primary" },
  { pct: 0.3, cls: "stroke-primary/70" },
  { pct: 0.15, cls: "stroke-primary/45" },
  { pct: 0.1, cls: "stroke-foreground/80" },
];
function AllocationMark({ className }: { className?: string }) {
  const c = 2 * Math.PI * 12;
  let offset = 0;
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <g transform="rotate(-90 16 16)">
        {SLICES.map((s, i) => {
          const len = s.pct * c - 1.4; // 1.4 = gap between slices
          const el = (
            <circle
              key={i}
              cx="16"
              cy="16"
              r="12"
              fill="none"
              strokeWidth="6"
              className={s.cls}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
            />
          );
          offset += s.pct * c;
          return el;
        })}
      </g>
    </svg>
  );
}
function AllocationFull() {
  return (
    <div className="flex items-center gap-3">
      <AllocationMark className="h-9 w-9 shrink-0" />
      <span className="font-sans text-2xl font-medium lowercase tracking-tight text-foreground">
        {NAME}
      </span>
    </div>
  );
}
function AllocationCompact() {
  return (
    <div className="flex items-center gap-2">
      <AllocationMark className="h-7 w-7 shrink-0" />
    </div>
  );
}

// --- D: Pronto — speed; italic, the last "o" becomes an up-right arrow -----
function ArrowO({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <circle cx="12" cy="13" r="8.5" fill="none" strokeWidth="3" className="stroke-primary" />
      <path d="M9 16 L18 7 M12 6.5 H18.5 V13" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="stroke-foreground" />
    </svg>
  );
}
function ProntoFull() {
  return (
    <span className="relative inline-flex items-end font-display text-[1.75rem] font-extrabold italic leading-none tracking-tighter text-foreground">
      {/* speed lines */}
      <span aria-hidden className="mr-1.5 flex flex-col gap-[3px] pb-1.5">
        <span className="block h-[2px] w-4 rounded bg-primary" />
        <span className="block h-[2px] w-2.5 rounded bg-primary/70" />
        <span className="block h-[2px] w-3.5 rounded bg-primary/45" />
      </span>
      Prontofoli
      <ArrowO className="ml-px h-[1.05em] w-[1.05em] translate-y-[0.12em]" />
    </span>
  );
}
function ProntoCompact() {
  return (
    <span className="inline-flex items-end font-display text-base font-extrabold italic leading-none tracking-tighter text-foreground">
      Prontofoli
      <ArrowO className="h-[1.05em] w-[1.05em] translate-y-[0.12em]" />
    </span>
  );
}

// --- E: Tile — app-icon monogram + stacked, tracked caps -------------------
function Tile({ size }: { size: "lg" | "sm" }) {
  return (
    <span
      className={
        size === "lg"
          ? "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm ring-1 ring-primary-emphasis/40"
          : "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
      }
    >
      <span className={size === "lg" ? "font-display text-xl font-bold tracking-tighter" : "font-display text-sm font-bold tracking-tighter"}>
        P<span className="opacity-70">f</span>
      </span>
    </span>
  );
}
function TileFull() {
  return (
    <div className="flex items-center gap-3">
      <Tile size="lg" />
      <span className="flex flex-col font-sans text-[0.8rem] font-bold uppercase leading-[1.1] tracking-[0.32em]">
        <span className="text-foreground">Pronto</span>
        <span className="text-primary">Folio</span>
      </span>
    </div>
  );
}
function TileCompact() {
  return (
    <div className="flex items-center gap-2">
      <Tile size="sm" />
    </div>
  );
}

// --- Registry ---------------------------------------------------------------
export const LOGO_VARIANTS = [
  { key: "A", name: "Frontier P", Full: FrontierFull, Compact: FrontierCompact },
  { key: "B", name: "Two-tone type", Full: TwoToneFull, Compact: TwoToneCompact },
  { key: "C", name: "Allocation donut", Full: AllocationFull, Compact: AllocationCompact },
  { key: "D", name: "Pronto (speed)", Full: ProntoFull, Compact: ProntoCompact },
  { key: "E", name: "Monogram tile", Full: TileFull, Compact: TileCompact },
] as const;

export const LOGO_PARAM = "logo";

function Swap({ size, fallback }: { size: "full" | "compact"; fallback: ReactNode }) {
  const key = useSearchParams().get(LOGO_PARAM);
  const v = LOGO_VARIANTS.find((x) => x.key === key);
  if (process.env.NODE_ENV === "production" || !v) return <>{fallback}</>;
  const C = size === "full" ? v.Full : v.Compact;
  return (
    <div aria-label={NAME} title={NAME}>
      <C />
    </div>
  );
}

/** Renders the `?logo=` variant if one is set, otherwise `children` (the real wordmark). */
export function PrototypeLogo({ size, children }: { size: "full" | "compact"; children: ReactNode }) {
  return (
    <Suspense fallback={children}>
      <Swap size={size} fallback={children} />
    </Suspense>
  );
}

/** The floating ←/→ bar, pre-bound to this prototype. Mounted in `(app)/layout.tsx`. */
export function ProntofolioLogoSwitcher() {
  return (
    <PrototypeSwitcher
      param={LOGO_PARAM}
      variants={LOGO_VARIANTS.map(({ key, name }) => ({ key, name }))}
    />
  );
}
