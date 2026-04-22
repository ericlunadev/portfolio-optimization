"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { StationFrame } from "./StationFrame";
import { getStation } from "./lessons";
import { cn } from "@/lib/utils";

type Phase = "early" | "mid" | "late" | "recession";

interface PhaseCopy {
  label: string;
  description: string;
  leaders: string[];
}

const PHASES: Record<Phase, PhaseCopy> = {
  early: {
    label: "Recuperación temprana",
    description: "Tasas bajas, confianza volviendo. El capital rota hacia lo cíclico.",
    leaders: ["Tecnología", "Discrecional", "Financieras"],
  },
  mid: {
    label: "Expansión media",
    description: "Crecimiento sostenido. Se amplía el liderazgo a industriales.",
    leaders: ["Industriales", "Tecnología", "Materiales"],
  },
  late: {
    label: "Ciclo tardío",
    description: "Inflación sube, tasas suben. Brillan materias primas y defensivos.",
    leaders: ["Energía", "Materiales", "Consumo básico"],
  },
  recession: {
    label: "Contracción",
    description: "El mercado se refugia en lo más estable.",
    leaders: ["Consumo básico", "Salud", "Servicios públicos"],
  },
};

const SECTORS = [
  { name: "Tecnología", short: "Tech" },
  { name: "Discrecional", short: "Disc" },
  { name: "Financieras", short: "Fin" },
  { name: "Industriales", short: "Ind" },
  { name: "Materiales", short: "Mat" },
  { name: "Energía", short: "Ene" },
  { name: "Consumo básico", short: "Bás" },
  { name: "Salud", short: "Sal" },
  { name: "Servicios públicos", short: "Utl" },
  { name: "Inmobiliario", short: "RE" },
  { name: "Telecom", short: "Tel" },
];

export function Station3Sectors({ id }: { id: string }) {
  const station = getStation("sectors");
  const [phase, setPhase] = useState<Phase>("mid");
  const copy = PHASES[phase];

  const radius = 140;
  const center = 170;

  return (
    <StationFrame station={station} id={id}>
      <div className="grid gap-10 md:grid-cols-[1fr_1fr] items-center">
        {/* Sector wheel */}
        <div className="flex items-center justify-center">
          <motion.svg
            width="340"
            height="340"
            viewBox="0 0 340 340"
            animate={{ rotate: phase === "mid" ? 0 : phase === "early" ? -20 : phase === "late" ? 20 : 40 }}
            transition={{ type: "spring", stiffness: 40, damping: 14 }}
          >
            <circle
              cx={center}
              cy={center}
              r={radius + 30}
              fill="none"
              stroke="hsl(230 15% 16%)"
              strokeWidth="0.5"
              strokeDasharray="2 4"
            />
            <circle
              cx={center}
              cy={center}
              r={radius - 30}
              fill="none"
              stroke="hsl(230 15% 16%)"
              strokeWidth="0.5"
              strokeDasharray="2 4"
            />
            {SECTORS.map((sector, i) => {
              const angle = (i / SECTORS.length) * Math.PI * 2 - Math.PI / 2;
              const x = center + Math.cos(angle) * radius;
              const y = center + Math.sin(angle) * radius;
              const isLeader = copy.leaders.includes(sector.name);
              return (
                <g key={sector.name}>
                  <motion.circle
                    cx={x}
                    cy={y}
                    r={isLeader ? 24 : 16}
                    fill={isLeader ? "hsl(38 65% 55% / 0.15)" : "hsl(230 15% 12%)"}
                    stroke={isLeader ? "hsl(38 65% 55%)" : "hsl(230 12% 22%)"}
                    strokeWidth={isLeader ? 1.5 : 0.8}
                    animate={{
                      r: isLeader ? 24 : 16,
                      filter: isLeader
                        ? "drop-shadow(0 0 10px hsl(38 65% 55% / 0.6))"
                        : "drop-shadow(0 0 0px transparent)",
                    }}
                    transition={{ type: "spring", stiffness: 150, damping: 18 }}
                  />
                  <motion.text
                    x={x}
                    y={y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    animate={{
                      fill: isLeader ? "hsl(38 65% 65%)" : "hsl(230 8% 50%)",
                    }}
                    style={{
                      fontSize: "10px",
                      fontWeight: isLeader ? 600 : 400,
                      transform: `rotate(${-(phase === "mid" ? 0 : phase === "early" ? -20 : phase === "late" ? 20 : 40)}deg)`,
                      transformOrigin: `${x}px ${y}px`,
                    }}
                  >
                    {sector.short}
                  </motion.text>
                </g>
              );
            })}
            {/* Center label */}
            <g
              style={{
                transform: `rotate(${-(phase === "mid" ? 0 : phase === "early" ? -20 : phase === "late" ? 20 : 40)}deg)`,
                transformOrigin: `${center}px ${center}px`,
              }}
            >
              <circle
                cx={center}
                cy={center}
                r={60}
                fill="hsl(230 15% 8%)"
                stroke="hsl(38 65% 55% / 0.2)"
                strokeWidth="1"
              />
              <text
                x={center}
                y={center - 8}
                textAnchor="middle"
                fill="hsl(230 8% 50%)"
                style={{ fontSize: "9px", letterSpacing: "0.15em" }}
              >
                FASE
              </text>
              <text
                x={center}
                y={center + 10}
                textAnchor="middle"
                fill="hsl(38 65% 55%)"
                style={{ fontSize: "13px", fontFamily: "var(--font-display)" }}
              >
                {copy.label.split(" ")[0]}
              </text>
            </g>
          </motion.svg>
        </div>

        {/* Controls + copy */}
        <div className="space-y-6">
          <p className="text-muted-foreground leading-relaxed">{station.summary}</p>

          <div>
            <div className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
              Fase del ciclo económico
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(PHASES) as Phase[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPhase(p)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm transition-all text-left",
                    phase === p
                      ? "border-primary/50 bg-primary/10 text-primary glow-gold"
                      : "border-border/50 bg-card/40 text-muted-foreground hover:border-border hover:text-foreground",
                  )}
                >
                  {PHASES[p].label}
                </button>
              ))}
            </div>
          </div>

          <motion.div
            key={phase}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="glass-card p-5 space-y-3"
          >
            <p className="text-sm text-muted-foreground leading-relaxed">
              {copy.description}
            </p>
            <div>
              <div className="mb-1.5 text-xs uppercase tracking-widest text-muted-foreground">
                Sectores líderes
              </div>
              <div className="flex flex-wrap gap-1.5">
                {copy.leaders.map((l) => (
                  <span
                    key={l}
                    className="rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-xs text-primary"
                  >
                    {l}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>

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
