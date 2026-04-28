"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { StationFrame } from "./StationFrame";
import { getStation } from "./lessons";
import { cn } from "@/lib/utils";

function GlobeLoading() {
  const t = useTranslations("Academia.ZoomGlobe");
  return (
    <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
      {t("loading")}
    </div>
  );
}

const ZoomGlobe = dynamic(() => import("./ZoomGlobe"), {
  ssr: false,
  loading: () => <GlobeLoading />,
});

type Climate = "expansion" | "contraction" | "stagflation";

export function Station1Macro({ id }: { id: string }) {
  const t = useTranslations("Academia.Station1");
  const tLessons = useTranslations("Academia.Lessons");
  const station = getStation("macro");
  const [climate, setClimate] = useState<Climate>("expansion");

  const climates: Climate[] = ["expansion", "contraction", "stagflation"];
  const currentLabel = t(`${climate}Label`);
  const currentDescription = t(`${climate}Description`);
  const currentMood = t(`${climate}Mood`);
  const currentWinners = [
    t(`${climate}Winner1`),
    t(`${climate}Winner2`),
    t(`${climate}Winner3`),
  ];

  return (
    <StationFrame station={station} id={id}>
      <div className="grid gap-10 md:grid-cols-[1fr_1fr] items-center">
        {/* Globe */}
        <div className="relative">
          <div className="aspect-square w-full max-w-md mx-auto">
            <ZoomGlobe climate={climate} />
          </div>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            {t("globeCaption")}
          </p>
        </div>

        {/* Controls + copy */}
        <div className="space-y-6">
          <p className="text-muted-foreground leading-relaxed">
            {tLessons(`${station.key}.summary`)}
          </p>

          <div>
            <div className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
              {t("climateLabel")}
            </div>
            <div className="flex gap-2">
              {climates.map((c) => (
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
                  {t(`${c}Label`)}
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
                <h3 className="font-display text-xl">{currentLabel}</h3>
                <span className="text-xs uppercase tracking-widest text-primary/80">
                  {currentMood}
                </span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {currentDescription}
              </p>
              <div>
                <div className="mb-1.5 text-xs uppercase tracking-widest text-muted-foreground">
                  {t("leadingSectorsLabel")}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {currentWinners.map((w) => (
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
