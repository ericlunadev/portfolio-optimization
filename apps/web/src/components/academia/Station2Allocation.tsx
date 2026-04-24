"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { StationFrame } from "./StationFrame";
import { getStation } from "./lessons";
import { cn } from "@/lib/utils";

type Profile = "conservative" | "moderate" | "aggressive";

interface ProfileCopy {
  label: string;
  mix: { stocks: number; bonds: number };
  maxDrawdown: number;
  description: string;
  curve: {
    volatility: number;
    preDrift: number;
    postDrift: number;
  };
}

const PROFILES: Record<Profile, ProfileCopy> = {
  conservative: {
    label: "Conservador",
    mix: { stocks: 20, bonds: 80 },
    maxDrawdown: -8,
    description:
      "Preservación del capital primero. Volatilidad baja, retornos modestos, pocas caídas grandes.",
    curve: { volatility: 0.35, preDrift: 0.35, postDrift: 0.45 },
  },
  moderate: {
    label: "Moderado",
    mix: { stocks: 60, bonds: 40 },
    maxDrawdown: -20,
    description:
      "El balance clásico. Participa del crecimiento pero amortigua los golpes con renta fija.",
    curve: { volatility: 1.0, preDrift: 0.75, postDrift: 1.05 },
  },
  aggressive: {
    label: "Agresivo",
    mix: { stocks: 90, bonds: 10 },
    maxDrawdown: -38,
    description:
      "Máximo crecimiento a largo plazo. Esperá caídas fuertes en recesiones; tenés que aguantar.",
    curve: { volatility: 2.1, preDrift: 1.15, postDrift: 1.65 },
  },
};

// All profiles share this y-range so curves are visually comparable
const Y_BOTTOM = 55;
const Y_TOP = 185;

function scaleY(v: number): number {
  const clamped = Math.max(Y_BOTTOM, Math.min(Y_TOP, v));
  return 100 - ((clamped - Y_BOTTOM) / (Y_TOP - Y_BOTTOM)) * 90 - 5;
}

function generateDrawdownPath(
  curve: ProfileCopy["curve"],
  drawdown: number,
  seed: number,
): string {
  const n = 50;
  const crashStart = 22;
  const crashEnd = 28;

  const values: number[] = [];
  let value = 100;
  let peak = 100;

  for (let i = 0; i <= n; i++) {
    if (i < crashStart) {
      value +=
        curve.preDrift +
        Math.sin(i * 0.7 + seed * 3) * curve.volatility +
        Math.cos(i * 1.3 + seed) * curve.volatility * 0.5;
      peak = Math.max(peak, value);
    } else if (i < crashEnd) {
      const t = (i - crashStart) / (crashEnd - crashStart);
      const eased = t * t;
      value = peak * (1 + (drawdown / 100) * eased);
    } else {
      value +=
        curve.postDrift +
        Math.sin(i * 0.5 + seed * 2) * curve.volatility +
        Math.cos(i * 0.9 + seed * 1.7) * curve.volatility * 0.4;
    }
    values.push(value);
  }

  return values
    .map((v, i) => {
      const x = (i / n) * 100;
      const y = scaleY(v);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export function Station2Allocation({ id }: { id: string }) {
  const station = getStation("allocation");
  const [profile, setProfile] = useState<Profile>("moderate");
  const copy = PROFILES[profile];

  const stocksAngle = (copy.mix.stocks / 100) * 360;

  const path = useMemo(
    () =>
      generateDrawdownPath(
        copy.curve,
        copy.maxDrawdown,
        profile === "conservative" ? 1 : profile === "moderate" ? 2 : 3,
      ),
    [copy.curve, copy.maxDrawdown, profile],
  );

  const baselineY = scaleY(100);

  return (
    <StationFrame station={station} id={id}>
      <div className="grid gap-10 md:grid-cols-[1fr_1fr] items-center">
        {/* Left: pie + drawdown */}
        <div className="space-y-6">
          {/* Animated donut */}
          <div className="flex items-center justify-center">
            <div className="relative">
              <svg width="220" height="220" viewBox="0 0 220 220">
                <circle
                  cx="110"
                  cy="110"
                  r="80"
                  fill="none"
                  stroke="hsl(230 15% 16%)"
                  strokeWidth="32"
                />
                <motion.circle
                  cx="110"
                  cy="110"
                  r="80"
                  fill="none"
                  stroke="hsl(38 65% 55%)"
                  strokeWidth="32"
                  strokeDasharray={`${(stocksAngle / 360) * 502.65} 502.65`}
                  strokeDashoffset="0"
                  transform="rotate(-90 110 110)"
                  initial={false}
                  animate={{
                    strokeDasharray: `${(stocksAngle / 360) * 502.65} 502.65`,
                  }}
                  transition={{ type: "spring", stiffness: 80, damping: 18 }}
                  style={{ filter: "drop-shadow(0 0 8px hsl(38 65% 55% / 0.4))" }}
                />
                <text
                  x="110"
                  y="100"
                  textAnchor="middle"
                  fill="hsl(40 6% 90%)"
                  className="text-xs"
                  style={{ fontSize: "11px", letterSpacing: "0.1em" }}
                >
                  PERFIL
                </text>
                <text
                  x="110"
                  y="125"
                  textAnchor="middle"
                  fill="hsl(38 65% 55%)"
                  style={{ fontSize: "22px", fontFamily: "var(--font-display)" }}
                >
                  {copy.label}
                </text>
              </svg>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-center">
            <div className="glass-card p-4">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Acciones
              </div>
              <motion.div
                key={`s-${profile}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="font-display text-2xl text-primary"
              >
                {copy.mix.stocks}%
              </motion.div>
            </div>
            <div className="glass-card p-4">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Bonos
              </div>
              <motion.div
                key={`b-${profile}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="font-display text-2xl text-foreground/80"
              >
                {copy.mix.bonds}%
              </motion.div>
            </div>
          </div>

          {/* Drawdown curve */}
          <div className="glass-card p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">
                Caída máxima simulada
              </span>
              <span className="text-sm font-medium text-destructive">
                {copy.maxDrawdown}%
              </span>
            </div>
            <svg viewBox="0 0 100 100" className="w-full h-28" preserveAspectRatio="none">
              {/* Baseline at starting value */}
              <line
                x1="0"
                y1={baselineY}
                x2="100"
                y2={baselineY}
                stroke="hsl(230 12% 28%)"
                strokeWidth="0.3"
                strokeDasharray="1 1.5"
              />
              <motion.path
                key={profile}
                d={path}
                fill="none"
                stroke="hsl(38 65% 55%)"
                strokeWidth="0.8"
                strokeLinejoin="round"
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.2, ease: "easeInOut" }}
              />
            </svg>
            <p className="mt-1 text-[11px] text-muted-foreground italic">
              Curva ilustrativa. Representa una trayectoria hipotética con recesión a mitad de camino.
            </p>
          </div>
        </div>

        {/* Right: selector + description */}
        <div className="space-y-6">
          <p className="text-muted-foreground leading-relaxed">{station.summary}</p>

          <div className="space-y-2">
            {(Object.keys(PROFILES) as Profile[]).map((p) => {
              const isActive = profile === p;
              return (
                <button
                  key={p}
                  onClick={() => setProfile(p)}
                  className={cn(
                    "w-full rounded-xl border p-4 text-left transition-all",
                    isActive
                      ? "border-primary/50 bg-primary/5 glow-gold"
                      : "border-border/50 bg-card/40 hover:border-border",
                  )}
                >
                  <div className="flex items-baseline justify-between">
                    <span
                      className={cn(
                        "font-display text-lg",
                        isActive ? "text-primary" : "text-foreground/80",
                      )}
                    >
                      {PROFILES[p].label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {PROFILES[p].mix.stocks}/{PROFILES[p].mix.bonds}
                    </span>
                  </div>
                  {isActive && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="mt-2 text-xs text-muted-foreground leading-relaxed"
                    >
                      {PROFILES[p].description}
                    </motion.p>
                  )}
                </button>
              );
            })}
          </div>

          <div className="glass-card p-4">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Tolerancia al dolor
            </div>
            <div className="font-display text-xl text-foreground/80">
              {Math.abs(copy.maxDrawdown)}%
            </div>
          </div>

          <ul className="space-y-2 text-sm text-muted-foreground">
            {station.bullets.map((b) => (
              <li key={b} className="flex gap-2">
                <span className="text-primary/60">→</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </StationFrame>
  );
}
