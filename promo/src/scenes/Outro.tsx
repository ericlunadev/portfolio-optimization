import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { beat, lerp, springAt } from "../motion";
import { BODY, C, DISPLAY } from "../theme";
import { GRADIENT, Mark } from "../ui";

/** "ProntoFolio. Tu portafolio, optimizado." — the mark builds, then the lockup. */
export const Outro: React.FC<{ cta: string }> = ({ cta }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const name = beat("outro", "prontofolio");
  const tagline = beat("outro", "tu");
  const optimized = beat("outro", "optimizado");

  const grow = [0, 1, 2].map((i) => springAt(frame, fps, i * 4, "bouncy"));
  const draw = lerp(frame, [10, 30], [0, 1]);
  const wordmark = springAt(frame, fps, name - 2, "snappy");
  const line = springAt(frame, fps, tagline - 4);
  const accent = springAt(frame, fps, optimized - 4, "bouncy");
  const ctaIn = springAt(frame, fps, optimized + 16, "bouncy");
  const glow = 0.5 + Math.sin(frame / 12) * 0.15;

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", paddingBottom: 60 }}>
      <div style={{ filter: `drop-shadow(0 0 ${50 * glow}px rgba(0,194,255,${0.35 * draw}))` }}>
        <Mark size={200} grow={grow} draw={draw} />
      </div>
      <div
        style={{
          fontFamily: DISPLAY,
          fontSize: 140,
          letterSpacing: -5,
          lineHeight: 1,
          marginTop: 30,
          opacity: wordmark,
          transform: `translateY(${(1 - wordmark) * 40}px)`,
          filter: `blur(${(1 - wordmark) * 12}px)`,
        }}
      >
        <span style={{ fontWeight: 300, color: C.fg, opacity: 0.7 }}>Pronto</span>
        <span style={{ fontWeight: 700, color: C.blueHi }}>Folio</span>
      </div>
      <div style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: 56, color: C.fg, marginTop: 26, opacity: line, transform: `translateY(${(1 - line) * 24}px)`, letterSpacing: -1 }}>
        Tu portafolio,{" "}
        <span
          style={{
            display: "inline-block",
            backgroundImage: GRADIENT,
            WebkitBackgroundClip: "text",
            color: "transparent",
            fontWeight: 700,
            transform: `scale(${0.7 + accent * 0.3})`,
            opacity: accent,
          }}
        >
          optimizado.
        </span>
      </div>
      <div
        style={{
          marginTop: 50,
          padding: "20px 44px",
          borderRadius: 999,
          background: GRADIENT,
          fontFamily: BODY,
          fontWeight: 800,
          fontSize: 30,
          color: "white",
          opacity: ctaIn,
          transform: `scale(${0.8 + ctaIn * 0.2})`,
          boxShadow: "0 0 60px rgba(37,99,255,0.45)",
        }}
      >
        {cta}
      </div>
    </AbsoluteFill>
  );
};
