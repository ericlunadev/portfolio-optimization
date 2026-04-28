"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, useScroll, useSpring } from "framer-motion";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { STATIONS } from "./lessons";
import { cn } from "@/lib/utils";

export function StationNav() {
  const tNav = useTranslations("Academia.StationNav");
  const tLessons = useTranslations("Academia.Lessons");
  const [active, setActive] = useState<string>("intro");

  const { scrollYProgress } = useScroll();
  const progressWidth = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(entry.target.id);
          }
        }
      },
      { rootMargin: "-40% 0px -40% 0px" },
    );

    const ids = ["intro", ...STATIONS.map((s) => `station-${s.key}`)];
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  const orderedIds = ["intro", ...STATIONS.map((s) => `station-${s.key}`)];
  const activeIdx = orderedIds.indexOf(active);

  const dotClass = (idx: number) => {
    const isActive = idx === activeIdx;
    const isPast = idx < activeIdx;
    return cn(
      "h-2 w-2 shrink-0 rounded-full border border-primary/40 transition-all",
      isActive && "bg-primary scale-125",
      isPast && "bg-primary/70",
      !isActive && !isPast && "bg-transparent group-hover:bg-primary/30",
    );
  };

  return (
    <>
      {/* Top progress bar */}
      <motion.div
        className="fixed top-0 left-0 right-0 h-[2px] bg-primary z-50 origin-left"
        style={{ scaleX: progressWidth }}
      />

      {/* Skip button top-right */}
      <Link
        href="/efficient-frontier/new"
        className="fixed top-4 right-4 md:top-6 md:right-8 z-40 flex items-center gap-1.5 rounded-full border border-border/60 bg-card/80 backdrop-blur-md px-3 py-1.5 text-xs text-muted-foreground transition-all hover:text-foreground hover:border-border"
      >
        <X className="h-3 w-3" />
        {tNav("skipToApp")}
      </Link>

      {/* Sticky station nav left: dot always visible; label appears as a floating pill on hover/active */}
      <nav className="group/nav fixed left-3 top-1/2 -translate-y-1/2 z-40 hidden lg:flex flex-col gap-5">
        <button
          onClick={() => scrollTo("intro")}
          className="group relative flex items-center gap-3 text-left"
        >
          <div className={dotClass(0)} />
          <span
            className={cn(
              "rounded-full border border-primary/40 bg-background/95 backdrop-blur-sm px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.15em] whitespace-nowrap transition-all",
              active === "intro"
                ? "text-primary opacity-100 translate-x-0"
                : "text-primary/80 opacity-0 -translate-x-1 pointer-events-none group-hover:opacity-100 group-hover:translate-x-0 group-hover:pointer-events-auto group-hover/nav:opacity-100 group-hover/nav:translate-x-0 group-hover/nav:pointer-events-auto",
            )}
          >
            {tNav("introLabel")}
          </span>
        </button>
        {STATIONS.map((s, i) => {
          const id = `station-${s.key}`;
          const isActive = active === id;
          return (
            <button
              key={s.key}
              onClick={() => scrollTo(id)}
              className="group relative flex items-center gap-3 text-left"
            >
              <div className={dotClass(i + 1)} />
              <span
                className={cn(
                  "rounded-full border border-primary/40 bg-background/95 backdrop-blur-sm px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.15em] whitespace-nowrap transition-all",
                  isActive
                    ? "text-primary opacity-100 translate-x-0"
                    : "text-primary/80 opacity-0 -translate-x-1 pointer-events-none group-hover:opacity-100 group-hover:translate-x-0 group-hover:pointer-events-auto group-hover/nav:opacity-100 group-hover/nav:translate-x-0 group-hover/nav:pointer-events-auto",
                )}
              >
                {String(s.index).padStart(2, "0")} · {tLessons(`${s.key}.label`)}
              </span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
