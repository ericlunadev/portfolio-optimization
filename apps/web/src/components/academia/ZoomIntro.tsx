"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { ChevronDown } from "lucide-react";
import { STATIONS } from "./lessons";

export function ZoomIntro() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  const scale = useTransform(scrollYProgress, [0, 1], [1, 1.6]);
  const opacity = useTransform(scrollYProgress, [0, 0.9], [1, 0]);
  const y = useTransform(scrollYProgress, [0, 1], [0, -80]);

  return (
    <section
      ref={ref}
      className="relative min-h-[100vh] flex items-center justify-center overflow-hidden"
    >
      <motion.div
        style={{ scale, opacity, y }}
        className="relative z-10 mx-auto max-w-3xl px-4 text-center space-y-6 md:px-6 md:space-y-8"
      >
        <div className="text-[10px] uppercase tracking-[0.25em] text-primary/80 md:text-xs md:tracking-[0.3em]">
          Academia · Guía para nuevos inversores
        </div>
        <h1 className="font-display text-4xl md:text-7xl leading-[1.05] tracking-tight">
          Análisis{" "}
          <span className="text-gradient-gold">Top-Down</span>
        </h1>
        <p className="mx-auto max-w-xl text-sm md:text-lg text-muted-foreground leading-relaxed">
          Invertir como un profesional no empieza buscando tickers. Empieza
          mirando el mundo. Vamos a hacer zoom: del planeta a la cartera, en
          cinco paradas.
        </p>

        {/* Zoom visual concept */}
        <div className="flex items-center justify-center gap-1 py-4 md:py-6">
          {STATIONS.map((s, i) => (
            <motion.div
              key={s.key}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 + i * 0.1 }}
              className="flex items-center gap-1"
            >
              <div
                className="rounded-full border border-primary/40 bg-primary/5 flex items-center justify-center text-xs font-medium text-primary"
                style={{
                  width: `clamp(${32 - i * 3}px, ${(48 - i * 5) / 16}rem, ${48 - i * 5}px)`,
                  height: `clamp(${32 - i * 3}px, ${(48 - i * 5) / 16}rem, ${48 - i * 5}px)`,
                }}
              >
                {s.index}
              </div>
              {i < STATIONS.length - 1 && (
                <div className="w-2 h-px bg-primary/30 sm:w-4" />
              )}
            </motion.div>
          ))}
        </div>

        <div className="text-xs text-muted-foreground">
          Cinco niveles · Aproximadamente 5 minutos
        </div>
      </motion.div>

      <motion.div
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 text-muted-foreground"
      >
        <ChevronDown className="h-6 w-6" />
      </motion.div>
    </section>
  );
}
