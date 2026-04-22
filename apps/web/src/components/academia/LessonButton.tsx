"use client";

import { useState } from "react";
import { GraduationCap } from "lucide-react";
import { AcademiaDrawer } from "./AcademiaDrawer";
import type { StationKey } from "./lessons";
import { cn } from "@/lib/utils";

interface LessonButtonProps {
  station?: StationKey;
  label?: string;
  variant?: "inline" | "pill";
  className?: string;
}

export function LessonButton({
  station = "macro",
  label = "¿Primera vez? Ver guía",
  variant = "pill",
  className,
}: LessonButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          variant === "pill"
            ? "inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs text-primary transition-all hover:bg-primary/10 hover:border-primary/50"
            : "inline-flex items-center gap-1 text-xs text-primary/80 hover:text-primary transition-colors",
          className,
        )}
      >
        <GraduationCap className="h-3.5 w-3.5" />
        {label}
      </button>

      <AcademiaDrawer
        open={open}
        onOpenChange={setOpen}
        initialStation={station}
      />
    </>
  );
}
