"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { StationFrame } from "./StationFrame";
import { getStation } from "./lessons";
import { cn } from "@/lib/utils";

type Phase = "early" | "mid" | "late" | "recession";

const PHASES: Phase[] = ["early", "mid", "late", "recession"];

const PHASE_LEADERS: Record<Phase, [string, string, string]> = {
  early: ["sectorTechnology", "sectorDiscretionary", "sectorFinancials"],
  mid: ["sectorIndustrials", "sectorTechnology", "sectorMaterials"],
  late: ["sectorEnergy", "sectorMaterials", "sectorStaples"],
  recession: ["sectorStaples", "sectorHealthcare", "sectorUtilities"],
};

const SECTOR_KEYS = [
  "sectorTechnology",
  "sectorDiscretionary",
  "sectorFinancials",
  "sectorIndustrials",
  "sectorMaterials",
  "sectorEnergy",
  "sectorStaples",
  "sectorHealthcare",
  "sectorUtilities",
  "sectorRealEstate",
  "sectorTelecom",
] as const;

export function Station3Sectors({ id }: { id: string }) {
  const t = useTranslations("Academia.Station3");
  const tLessons = useTranslations("Academia.Lessons");
  const station = getStation("sectors");
  const [phase, setPhase] = useState<Phase>("mid");

  const radius = 140;
  const center = 170;

  const phaseLabel = (p: Phase) => t(`${p}Label`);
  const phaseDescription = t(`${phase}Description`);
  const phaseShort = t(`${phase}Short`);
  const leaderKeys = PHASE_LEADERS[phase];
  const leaderNames = leaderKeys.map((k) => t(k));

  const rotation =
    phase === "mid" ? 0 : phase === "early" ? -20 : phase === "late" ? 20 : 40;

  return (
    <StationFrame station={station} id={id}>
      <div className="grid gap-10 md:grid-cols-[1fr_1fr] items-center">
        {/* Sector wheel */}
        <div className="flex items-center justify-center">
          <motion.svg
            width="340"
            height="340"
            viewBox="0 0 340 340"
            animate={{ rotate: rotation }}
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
            {SECTOR_KEYS.map((sectorKey, i) => {
              const angle = (i / SECTOR_KEYS.length) * Math.PI * 2 - Math.PI / 2;
              const x = center + Math.cos(angle) * radius;
              const y = center + Math.sin(angle) * radius;
              const isLeader = leaderKeys.includes(sectorKey);
              const shortLabel = t(`${sectorKey}Short`);
              return (
                <g key={sectorKey}>
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
                      transform: `rotate(${-rotation}deg)`,
                      transformOrigin: `${x}px ${y}px`,
                    }}
                  >
                    {shortLabel}
                  </motion.text>
                </g>
              );
            })}
            {/* Center label */}
            <g
              style={{
                transform: `rotate(${-rotation}deg)`,
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
                {t("phaseLabel")}
              </text>
              <text
                x={center}
                y={center + 10}
                textAnchor="middle"
                fill="hsl(38 65% 55%)"
                style={{ fontSize: "13px", fontFamily: "var(--font-display)" }}
              >
                {phaseShort}
              </text>
            </g>
          </motion.svg>
        </div>

        {/* Controls + copy */}
        <div className="space-y-6">
          <p className="text-muted-foreground leading-relaxed">
            {tLessons(`${station.key}.summary`)}
          </p>

          <div>
            <div className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
              {t("phaseSelectorLabel")}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {PHASES.map((p) => (
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
                  {phaseLabel(p)}
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
              {phaseDescription}
            </p>
            <div>
              <div className="mb-1.5 text-xs uppercase tracking-widest text-muted-foreground">
                {t("leadingSectorsLabel")}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {leaderNames.map((l) => (
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
            {[1, 2, 3].map((n) => {
              const text = tLessons(`${station.key}.bullet${n}`);
              return (
                <li key={n} className="flex gap-2">
                  <span className="text-primary/60">→</span>
                  <span>{text}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </StationFrame>
  );
}
