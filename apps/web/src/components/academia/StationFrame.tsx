"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef, ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { StationMeta } from "./lessons";

interface StationFrameProps {
  station: StationMeta;
  children: ReactNode;
  id: string;
  className?: string;
}

export function StationFrame({ station, children, id, className }: StationFrameProps) {
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
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-10 flex items-baseline gap-4">
            <span className="font-display text-6xl text-gradient-gold leading-none">
              {String(station.index).padStart(2, "0")}
            </span>
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                {station.label}
              </div>
              <h2 className="font-display text-3xl md:text-4xl leading-tight">
                {station.title}
              </h2>
            </div>
          </div>
          <p className="mb-10 max-w-2xl text-base md:text-lg text-muted-foreground italic border-l-2 border-primary/40 pl-4">
            {station.tagline}
          </p>
          {children}
        </div>
      </motion.div>
    </section>
  );
}
