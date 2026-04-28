"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { StationMeta } from "./lessons";

interface StationFrameProps {
  station: StationMeta;
  children: ReactNode;
  id: string;
  className?: string;
}

export function StationFrame({ station, children, id, className }: StationFrameProps) {
  const tLessons = useTranslations("Academia.Lessons");
  const ref = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const opacity = useTransform(scrollYProgress, [0, 0.15, 0.9, 1], [0.5, 1, 1, 0.7]);

  return (
    <section
      ref={ref}
      id={id}
      className={cn(
        "relative min-h-screen flex items-center py-24 border-t border-border/30",
        className,
      )}
    >
      <motion.div style={{ opacity }} className="w-full">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <div className="mb-8 flex items-baseline gap-3 md:mb-10 md:gap-4">
            <span className="font-display text-4xl md:text-6xl text-gradient-gold leading-none">
              {String(station.index).padStart(2, "0")}
            </span>
            <div className="min-w-0">
              <div className="text-[10px] md:text-xs uppercase tracking-widest text-muted-foreground">
                {tLessons(`${station.key}.label`)}
              </div>
              <h2 className="font-display text-2xl md:text-4xl leading-tight">
                {tLessons(`${station.key}.title`)}
              </h2>
            </div>
          </div>
          <p className="mb-8 md:mb-10 max-w-2xl text-sm md:text-lg text-muted-foreground italic border-l-2 border-primary/40 pl-3 md:pl-4">
            {tLessons(`${station.key}.tagline`)}
          </p>
          {children}
        </div>
      </motion.div>
    </section>
  );
}
