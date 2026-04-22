"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowRight } from "lucide-react";
import { STATIONS, type StationKey, getStation } from "./lessons";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

interface AcademiaDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialStation?: StationKey;
}

export function AcademiaDrawer({
  open,
  onOpenChange,
  initialStation = "macro",
}: AcademiaDrawerProps) {
  const [current, setCurrent] = useState<StationKey>(initialStation);

  useEffect(() => {
    if (open) setCurrent(initialStation);
  }, [open, initialStation]);

  const station = getStation(current);
  const idx = STATIONS.findIndex((s) => s.key === current);
  const prev = idx > 0 ? STATIONS[idx - 1] : null;
  const next = idx < STATIONS.length - 1 ? STATIONS[idx + 1] : null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
              />
            </Dialog.Overlay>

            <Dialog.Content asChild>
              <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", stiffness: 260, damping: 30 }}
                className="fixed right-0 top-0 z-50 h-screen w-full max-w-md border-l border-border bg-card shadow-2xl overflow-y-auto"
              >
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/50 bg-card/95 backdrop-blur-md px-6 py-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-primary/80">
                      Academia · Parada {station.index} de {STATIONS.length}
                    </div>
                    <Dialog.Title className="font-display text-lg">
                      {station.label}
                    </Dialog.Title>
                  </div>
                  <Dialog.Close className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                    <X className="h-4 w-4" />
                  </Dialog.Close>
                </div>

                <div className="px-6 py-6 space-y-6">
                  {/* Station dots nav */}
                  <div className="flex items-center gap-1.5">
                    {STATIONS.map((s) => (
                      <button
                        key={s.key}
                        onClick={() => setCurrent(s.key)}
                        className={cn(
                          "h-1.5 flex-1 rounded-full transition-all",
                          s.key === current
                            ? "bg-primary"
                            : "bg-border hover:bg-muted-foreground/40",
                        )}
                        aria-label={`Ir a ${s.label}`}
                      />
                    ))}
                  </div>

                  <motion.div
                    key={current}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    className="space-y-5"
                  >
                    <div>
                      <h3 className="font-display text-2xl leading-tight">
                        {station.title}
                      </h3>
                      <p className="mt-2 text-sm italic text-muted-foreground">
                        {station.tagline}
                      </p>
                    </div>

                    <p className="text-sm text-foreground/80 leading-relaxed">
                      {station.summary}
                    </p>

                    <ul className="space-y-2">
                      {station.bullets.map((b) => (
                        <li
                          key={b}
                          className="flex gap-2 text-sm text-muted-foreground"
                        >
                          <span className="text-primary/60">→</span>
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>

                    <Link
                      href={`/academia#station-${station.key}`}
                      className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                    >
                      Ver esta parada en la experiencia completa
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </motion.div>
                </div>

                <div className="sticky bottom-0 border-t border-border/50 bg-card/95 backdrop-blur-md px-6 py-4 flex items-center justify-between">
                  <button
                    onClick={() => prev && setCurrent(prev.key)}
                    disabled={!prev}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    ← {prev?.label ?? ""}
                  </button>
                  <button
                    onClick={() => next && setCurrent(next.key)}
                    disabled={!next}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {next?.label ?? ""} →
                  </button>
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
