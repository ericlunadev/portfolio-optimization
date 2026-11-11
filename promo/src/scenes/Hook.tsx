import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { beat, lerp, rng, springAt } from "../motion";
import { C } from "../theme";
import { Chip, Headline, words } from "../ui";

const TICKERS = ["MELI", "GGAL", "YPF", "AAPL", "SPY", "KO", "PAMP", "NVDA", "BMA", "VIST", "TSLA", "AL30"];

// Seeded spots around the frame edge, kept clear of the headline in the middle.
const SPOTS = (() => {
  const r = rng(3);
  const ring = [
    [230, 200], [620, 130], [1300, 140], [1690, 220],
    [150, 520], [1770, 520], [260, 840], [640, 900],
    [1280, 910], [1680, 830], [980, 110], [960, 930],
  ];
  return ring.map(([x, y], i) => ({ x: x + (r() - 0.5) * 60, y: y + (r() - 0.5) * 40, tilt: (r() - 0.5) * 16, phase: i * 1.7 }));
})();

/** "¿Seguís armando tu cartera a ojo?" — tickers drift with guessed weights. */
export const Hook: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ojo = beat("hook", "ojo");
  const shake = lerp(frame, [ojo, ojo + 4], [0, 1]) * lerp(frame, [ojo + 4, ojo + 22], [1, 0]);
  const gather = lerp(frame, [duration - 18, duration], [0, 1]);

  return (
    <AbsoluteFill>
      {TICKERS.map((ticker, i) => {
        const spot = SPOTS[i];
        const s = springAt(frame, fps, 2 + i * 2, "bouncy");
        // The weight flickers: someone guessing, not computing.
        const guess = 5 + Math.floor(rng(i * 97 + Math.floor(frame / 7))() * 36);
        const dx = Math.sin(frame / 22 + spot.phase) * 14 + Math.sin(frame * 1.9 + i) * 10 * shake;
        const dy = Math.cos(frame / 26 + spot.phase) * 10;
        const x = spot.x + dx + (960 - spot.x) * gather * 0.5;
        const y = spot.y + dy + (540 - spot.y) * gather * 0.5;
        return (
          <div
            key={ticker}
            style={{
              position: "absolute",
              left: x,
              top: y,
              transform: `translate(-50%, -50%) rotate(${spot.tilt + shake * Math.sin(frame + i) * 8}deg) scale(${s * (1 - gather * 0.4)})`,
              opacity: s * (1 - gather),
            }}
          >
            <Chip style={{ fontSize: 26 }}>
              {ticker}
              <span style={{ color: C.amber, fontWeight: 600 }}>{guess}%</span>
              <span style={{ color: C.faint }}>?</span>
            </Chip>
          </div>
        );
      })}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", paddingBottom: 40 }}>
        <Headline lines={[words("¿Seguís armando"), words("tu cartera")]} size={104} align="center" delay={4} />
        <div style={{ height: 8 }} />
        <Headline lines={[words("*a* *ojo?*")]} size={168} align="center" delay={ojo - 4} stagger={4} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
