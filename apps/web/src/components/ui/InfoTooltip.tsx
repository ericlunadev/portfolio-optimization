"use client";

import { useState, useRef, useEffect } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface InfoTooltipProps {
  content: string;
  className?: string;
}

export function InfoTooltip({ content, className }: InfoTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState<"top" | "bottom">("top");
  const tooltipRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isVisible && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceAbove = rect.top;
      const spaceBelow = window.innerHeight - rect.bottom;

      // Show tooltip below if not enough space above
      setPosition(spaceAbove < 150 ? "bottom" : "top");
    }
  }, [isVisible]);

  return (
    <div className={cn("relative inline-flex items-center", className)}>
      <button
        ref={triggerRef}
        type="button"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onFocus={() => setIsVisible(true)}
        onBlur={() => setIsVisible(false)}
        className="inline-flex items-center justify-center rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
        aria-label="Informacion"
      >
        <Info className="h-4 w-4" />
      </button>

      {isVisible && (
        <div
          ref={tooltipRef}
          role="tooltip"
          className={cn(
            "absolute z-50 w-72 rounded-lg border border-border bg-popover p-3 text-sm text-popover-foreground shadow-lg",
            position === "top" ? "bottom-full mb-2" : "top-full mt-2",
            "left-1/2 -translate-x-1/2"
          )}
        >
          <p className="whitespace-pre-line">{content}</p>
          {/* Arrow */}
          <div
            className={cn(
              "absolute left-1/2 -translate-x-1/2 border-8 border-transparent",
              position === "top"
                ? "top-full border-t-border -mt-px"
                : "bottom-full border-b-border -mb-px"
            )}
          />
          <div
            className={cn(
              "absolute left-1/2 -translate-x-1/2 border-8 border-transparent",
              position === "top"
                ? "top-full border-t-popover"
                : "bottom-full border-b-popover"
            )}
          />
        </div>
      )}
    </div>
  );
}
