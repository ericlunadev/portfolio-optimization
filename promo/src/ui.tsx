import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { BODY, C, DISPLAY } from "./theme";
import { lerp, springAt } from "./motion";

export const GRADIENT = `linear-gradient(100deg, ${C.blueHi} 0%, ${C.cyan} 100%)`;

/** Persistent backdrop: Azul Noche with two slow light pools and a dot grid. */
export const Stage: React.FC = () => {
  const frame = useCurrentFrame();
  const ax = 30 + Math.sin(frame / 90) * 6;
  const ay = 25 + Math.cos(frame / 110) * 5;
  const bx = 75 + Math.cos(frame / 100) * 6;
  const by = 80 + Math.sin(frame / 80) * 4;
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(900px 700px at ${ax}% ${ay}%, rgba(37,99,255,0.20), transparent 70%),
                       radial-gradient(800px 600px at ${bx}% ${by}%, rgba(0,194,255,0.12), transparent 70%)`,
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(rgba(236,242,250,0.07) 1.2px, transparent 1.2px)`,
          backgroundSize: "36px 36px",
          backgroundPosition: `0px ${-(frame * 0.3) % 36}px`,
          maskImage: "radial-gradient(ellipse 75% 70% at 50% 50%, black 30%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 75% 70% at 50% 50%, black 30%, transparent 100%)",
        }}
      />
    </AbsoluteFill>
  );
};

/** Enter/exit envelope shared by every scene so the cuts read as one system. */
export const SceneFrame: React.FC<{ duration: number; children: React.ReactNode }> = ({ duration, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = springAt(frame, fps, 0);
  const exit = lerp(frame, [duration - 12, duration], [0, 1]);
  return (
    <AbsoluteFill
      style={{
        opacity: Math.min(enter, 1 - exit),
        transform: `translateY(${(1 - enter) * 30 - exit * 20}px) scale(${1 - exit * 0.03})`,
        filter: `blur(${exit * 8 + (1 - enter) * 6}px)`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

type Word = { text: string; accent?: boolean };

/**
 * Display headline whose words rise in on staggered springs. Lines are arrays
 * of words; `accent` words take the brand gradient.
 */
export const Headline: React.FC<{
  lines: Word[][];
  delay?: number;
  size?: number;
  align?: "left" | "center";
  stagger?: number;
}> = ({ lines, delay = 4, size = 92, align = "left", stagger = 3 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  let index = 0;
  return (
    <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: size, lineHeight: 1.02, letterSpacing: -size * 0.03, color: C.fg, textAlign: align }}>
      {lines.map((line, li) => (
        <div key={li} style={{ display: "flex", gap: size * 0.24, justifyContent: align === "center" ? "center" : "flex-start" }}>
          {line.map((word) => {
            const s = springAt(frame, fps, delay + index++ * stagger, "snappy");
            return (
              <span
                key={word.text}
                style={{
                  display: "inline-block",
                  opacity: s,
                  transform: `translateY(${(1 - s) * size * 0.5}px)`,
                  filter: `blur(${(1 - s) * 10}px)`,
                  ...(word.accent
                    ? { backgroundImage: GRADIENT, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", paddingBottom: size * 0.08 }
                    : null),
                }}
              >
                {word.text}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

/** Turns "La combinación *óptima*" into headline words. */
export const words = (line: string): Word[] =>
  line.split(" ").map((w) => (w.startsWith("*") ? { text: w.replace(/\*/g, ""), accent: true } : { text: w }));

export const Kicker: React.FC<{ children: React.ReactNode; delay?: number; color?: string }> = ({ children, delay = 0, color = C.cyan }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = springAt(frame, fps, delay);
  return (
    <div
      style={{
        fontFamily: BODY,
        fontWeight: 700,
        fontSize: 22,
        letterSpacing: 4,
        textTransform: "uppercase",
        color,
        opacity: s,
        transform: `translateX(${(1 - s) * -24}px)`,
        display: "flex",
        alignItems: "center",
        gap: 14,
        marginBottom: 28,
      }}
    >
      <span style={{ width: 36 * s, height: 2, background: color, display: "inline-block" }} />
      {children}
    </div>
  );
};

export const Card: React.FC<{ style?: React.CSSProperties; children: React.ReactNode }> = ({ style, children }) => (
  <div
    style={{
      background: `linear-gradient(180deg, ${C.cardHi} 0%, ${C.card} 100%)`,
      border: `1px solid ${C.border}`,
      borderRadius: 28,
      boxShadow: "0 40px 80px -30px rgba(2,6,20,0.8), inset 0 1px 0 rgba(255,255,255,0.05)",
      fontFamily: BODY,
      color: C.fg,
      ...style,
    }}
  >
    {children}
  </div>
);

/** Ticker / label pill. */
export const Chip: React.FC<{ children: React.ReactNode; style?: React.CSSProperties; active?: boolean }> = ({ children, style, active }) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      padding: "12px 20px",
      borderRadius: 999,
      border: `1px solid ${active ? C.blueHi : C.border}`,
      background: active ? "rgba(37,99,255,0.18)" : C.card,
      fontFamily: BODY,
      fontWeight: 700,
      fontSize: 24,
      color: C.fg,
      whiteSpace: "nowrap",
      ...style,
    }}
  >
    {children}
  </div>
);

/** Left text column / right UI panel layout used by the feature scenes. */
export const Split: React.FC<{ left: React.ReactNode; right: React.ReactNode }> = ({ left, right }) => (
  <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", padding: "0 120px 70px 140px", gap: 70 }}>
    <div style={{ width: 640, flexShrink: 0 }}>{left}</div>
    <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>{right}</div>
  </AbsoluteFill>
);

/**
 * Bottom captions, highlighted word by word at the measured voice timings so
 * the video reads with the sound off.
 */
export const Caption: React.FC<{ text: string; starts: number[]; end: number }> = ({ text, starts, end }) => {
  const frame = useCurrentFrame();
  const tokens = text.split(" ");
  const opacity = Math.min(lerp(frame, [starts[0] - 6, starts[0] + 2], [0, 1]), lerp(frame, [end, end + 8], [1, 0]));
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 46 }}>
      <div
        style={{
          maxWidth: 1400,
          textAlign: "center",
          fontFamily: BODY,
          fontWeight: 600,
          fontSize: 30,
          lineHeight: 1.35,
          opacity,
          padding: "10px 26px",
          borderRadius: 16,
          background: "rgba(11,19,43,0.72)",
        }}
      >
        {tokens.map((token, i) => {
          // Fallback when the transcript and script split differently.
          const start = starts[i] ?? starts[starts.length - 1];
          const said = lerp(frame, [start - 2, start + 3], [0, 1]);
          return (
            <span key={i} style={{ color: said > 0.5 ? C.fg : C.faint, transition: "none" }}>
              {token}
              {i < tokens.length - 1 ? " " : ""}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

export const Mark: React.FC<{ size: number; grow?: number[]; draw?: number }> = ({ size, grow = [1, 1, 1], draw = 1 }) => {
  // Geometry from apps/web/src/components/brand/ProntofolioMark.tsx.
  const shaft = "M2.5 21.5 L11 14 L16 17.5 L26.5 7.5";
  const head = "M20.5 6.5 H27.5 V13.5";
  const shaftLength = 33;
  const headLength = 14;
  const bars = [
    { x: 3, y: 19, h: 10 },
    { x: 12.75, y: 13, h: 16 },
    { x: 22.5, y: 6, h: 23 },
  ];
  const headDraw = lerp(draw, [0.75, 1], [0, 1]);
  const shaftDraw = lerp(draw, [0, 0.75], [0, 1]);
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id="mark-bars" x1="4" y1="28" x2="28" y2="5" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={C.blue} />
          <stop offset="100%" stopColor={C.cyan} />
        </linearGradient>
        <mask id="mark-cut" maskUnits="userSpaceOnUse" x="-4" y="-4" width="40" height="40">
          <rect x="-4" y="-4" width="40" height="40" fill="white" />
          <g fill="none" stroke="black" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round">
            <path d={shaft} strokeDasharray={shaftLength} strokeDashoffset={shaftLength * (1 - shaftDraw)} />
            <path d={head} strokeDasharray={headLength} strokeDashoffset={headLength * (1 - headDraw)} opacity={headDraw > 0 ? 1 : 0} />
          </g>
        </mask>
      </defs>
      <g fill="url(#mark-bars)" mask="url(#mark-cut)">
        {bars.map((bar, i) => {
          const h = bar.h * grow[i];
          return <rect key={i} x={bar.x} y={29 - h} width={6.5} height={Math.max(h, 0.001)} rx={1.6} />;
        })}
      </g>
      <g fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d={shaft} strokeDasharray={shaftLength} strokeDashoffset={shaftLength * (1 - shaftDraw)} />
        <path d={head} strokeDasharray={headLength} strokeDashoffset={headLength * (1 - headDraw)} opacity={headDraw > 0 ? 1 : 0} />
      </g>
    </svg>
  );
};
