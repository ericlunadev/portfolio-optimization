"use client";

import { CSSProperties, ReactNode, useRef } from "react";
import { useInView } from "framer-motion";

interface ChartRevealProps {
  children: ReactNode;
  placeholderClassName?: string;
  placeholderStyle?: CSSProperties;
  className?: string;
}

export function ChartReveal({
  children,
  placeholderClassName = "h-[260px] sm:h-[340px] md:h-[400px]",
  placeholderStyle,
  className,
}: ChartRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  return (
    <div ref={ref} className={className}>
      {isInView ? (
        children
      ) : (
        <div className={placeholderClassName} style={placeholderStyle} />
      )}
    </div>
  );
}
