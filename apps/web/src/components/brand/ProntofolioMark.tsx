"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

const ARROW_SHAFT = "M2.5 21.5 L11 14 L16 17.5 L26.5 7.5";
const ARROW_HEAD = "M20.5 6.5 H27.5 V13.5";

/**
 * The Prontofolio isotype: three rising bars in the Azul Eléctrico → Cian
 * Digital gradient, with the Verde Data arrow climbing across them.
 *
 * Colours come from the `--brand-*` tokens, never a tenant's accent: this is
 * our logo and is only drawn for our own tenant (see `BrandLockup`). The gap
 * around the arrow is a mask rather than a stroke in the page colour, so the
 * mark sits on any surface — card, glass, the globe — without a halo.
 */
export function ProntofolioMark({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  const gradientId = `prontofolio-bars-${id}`;
  const maskId = `prontofolio-cut-${id}`;

  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("shrink-0", className)}
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="4"
          y1="28"
          x2="28"
          y2="5"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="hsl(var(--brand-blue))" />
          <stop offset="100%" stopColor="hsl(var(--brand-cyan))" />
        </linearGradient>
        {/* Mask luminance, not a colour: white keeps, black cuts. */}
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">
          <rect width="32" height="32" fill="white" />
          <g
            fill="none"
            stroke="black"
            strokeWidth="5.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={ARROW_SHAFT} />
            <path d={ARROW_HEAD} />
          </g>
        </mask>
      </defs>
      <g fill={`url(#${gradientId})`} mask={`url(#${maskId})`}>
        <rect x="3" y="19" width="6.5" height="10" rx="1.6" />
        <rect x="12.75" y="13" width="6.5" height="16" rx="1.6" />
        <rect x="22.5" y="6" width="6.5" height="23" rx="1.6" />
      </g>
      <g
        fill="none"
        stroke="hsl(var(--brand-green))"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={ARROW_SHAFT} />
        <path d={ARROW_HEAD} />
      </g>
    </svg>
  );
}
