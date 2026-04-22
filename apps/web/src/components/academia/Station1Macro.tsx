"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { StationFrame } from "./StationFrame";
import { getStation } from "./lessons";
import { cn } from "@/lib/utils";

const ZoomGlobe = dynamic(() => import("./ZoomGlobe"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
      Cargando globo...
    </div>
  ),
});

type Climate = "expansion" | "contraction" | "stagflation";

interface ClimateCopy {
  label: string;
  description: string;
  winners: string[];
  mood: string;
}

const CLIMATES: Record<Climate, ClimateCopy> = {
  expansion: {
    label: "Expansión",
    description:
      "Tasas bajas, crecimiento saludable, empleo fuerte. El optimismo es el tono dominante.",
    winners: ["Tecnología", "Consumo discrecional", "Industriales"],
    mood: "Viento a favor",
  },
  contraction: {
    label: "Contracción",
    description:
      "Actividad cayendo, despidos, crédito más caro. El capital busca refugio en activos defensivos.",
    winners: ["Bonos largos", "Consumo básico", "Servicios públicos"],
    mood: "Modo defensivo",
  },
  stagflation: {
    label: "Estanflación",
    description:
      "Inflación alta mientras la economía se estanca. La peor combinación: ahorro que pierde valor real.",
    winners: ["Energía", "Materiales", "Oro"],
    mood: "Refugio en tangibles",
  },
};

export function Station1Macro({ id }: { id: string }) {
  const station = getStation("macro");
  const [climate, setClimate] = useState<Climate>("expansion");
  const copy = CLIMATES[climate];

  return (
    <StationFrame station={station} id={id}>
      <div className="grid gap-10 md:grid-cols-[1fr_1fr] items-center">
        {/* Globe */}
        <div className="relative">
          <div className="aspect-square w-full max-w-md mx-auto">
            <ZoomGlobe climate={climate} />
          </div>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Representación ilustrativa. Arrastrá para rotar.
          </p>
        </div>

        {/* Controls + copy */}
        <div className="space-y-6">
          <p className="text-muted-foreground leading-relaxed">{station.summary}</p>

          <div>
            <div className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
              Elegí el clima económico
            </div>
            <div className="flex gap-2">
              {(Object.keys(CLIMATES) as Climate[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setClimate(c)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm transition-all",
                    climate === c
                      ? "border-primary/50 bg-primary/10 text-primary glow-gold"
                      : "border-border/50 bg-card/40 text-muted-foreground hover:border-border hover:text-foreground",
                  )}
                >
                  {CLIMATES[c].label}
                </button>
              ))}
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={climate}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="glass-card p-5 space-y-3"
            >
              <div className="flex items-baseline justify-between">
                <h3 className="font-display text-xl">{copy.label}</h3>
                <span className="text-xs uppercase tracking-widest text-primary/80">
                  {copy.mood}
                </span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {copy.description}
              </p>
              <div>
                <div className="mb-1.5 text-xs uppercase tracking-widest text-muted-foreground">
                  Sectores que suelen liderar
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {copy.winners.map((w) => (
                    <span
                      key={w}
                      className="rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-xs text-primary"
                    >
                      {w}
                    </span>
                  ))}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

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
