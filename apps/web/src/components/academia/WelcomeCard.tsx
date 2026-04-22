"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GraduationCap, X, ArrowRight } from "lucide-react";

const STORAGE_KEY = "academia.welcome.dismissed";

export function WelcomeCard() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (!dismissed) setVisible(true);
  }, []);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12, height: 0, marginBottom: 0 }}
          transition={{ duration: 0.3 }}
          className="glass-card relative overflow-hidden p-5 md:p-6 border-primary/30"
        >
          <div className="absolute inset-0 pointer-events-none opacity-50"
            style={{
              background:
                "radial-gradient(ellipse at top right, hsl(38 65% 55% / 0.08), transparent 60%)",
            }}
          />
          <button
            onClick={dismiss}
            aria-label="Cerrar"
            className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <div className="rounded-xl bg-primary/10 p-3 border border-primary/20">
                <GraduationCap className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-display text-lg md:text-xl leading-tight">
                  ¿Primera vez invirtiendo?
                </h3>
                <p className="mt-1 text-sm text-muted-foreground max-w-lg">
                  Recorré la guía Top-Down en cinco paradas. Del mapa global
                  hasta los pesos de tu cartera, en unos cinco minutos.
                </p>
              </div>
            </div>
            <Link
              href="/academia"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 glow-gold whitespace-nowrap"
            >
              Empezar
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
