import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { SERIES, SERIES_MONTHS } from "../data";
import { beat, lerp, springAt } from "../motion";
import { BODY, C } from "../theme";
import { Card, Chip, Headline, Kicker, Split, words } from "../ui";

const CW = 790;
const CH = 470;
const MAX = Math.max(...SERIES.portfolio, ...SERIES.sp500, ...SERIES.custom) * 1.08;
const MIN = Math.min(0, ...SERIES.portfolio, ...SERIES.sp500, ...SERIES.custom) - 0.05;
const px = (i: number) => (i / SERIES_MONTHS) * CW;
const py = (v: number) => CH - ((v - MIN) / (MAX - MIN)) * CH;

const path = (values: number[], progress: number) => {
  const shown = progress * SERIES_MONTHS;
  const whole = Math.floor(shown);
  const parts = values.slice(0, whole + 1).map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`);
  if (whole < SERIES_MONTHS) {
    const t = shown - whole;
    const v = values[whole] + (values[whole + 1] - values[whole]) * t;
    parts.push(`${px(shown).toFixed(1)},${py(v).toFixed(1)}`);
  }
  return { d: `M${parts.join(" L")}`, x: px(shown), y: py(values[Math.min(whole, SERIES_MONTHS)]) };
};

// Illustrative cumulative growth of each risk-free preset over the window; the
// app fetches live rates.
const RF_END = { plazo: 0.22, caucion: 0.27 };

const signed = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1).replace(".", ",")}%`;

/** "Te comparás con el S&P 500 o con tus propios índices, y usás el plazo fijo o la caución…" */
export const Benchmark: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const compare = beat("benchmark", "comparás");
  const sp = beat("benchmark", "S&P");
  const own = beat("benchmark", "propios");
  const use = beat("benchmark", "usás");
  const plazo = beat("benchmark", "plazo");
  const caucion = beat("benchmark", "caución");

  const panel = springAt(frame, fps, 2);
  const mine = lerp(frame, [compare - 6, sp + 10], [0, 1]);
  const spLine = lerp(frame, [sp - 2, own], [0, 1]);
  const ownLine = lerp(frame, [own - 4, use], [0, 1]);
  const rfIn = springAt(frame, fps, plazo - 4);
  const toCaucion = springAt(frame, fps, caucion - 2, "snappy");
  const rfEnd = RF_END.plazo + (RF_END.caucion - RF_END.plazo) * toCaucion;
  const chipIn = springAt(frame, fps, use - 2, "bouncy");

  const lines = [
    { key: "portfolio", label: "Tu portafolio", values: SERIES.portfolio, color: C.cyan, width: 5, progress: mine, dash: undefined },
    { key: "sp500", label: "S&P 500", values: SERIES.sp500, color: C.muted, width: 3.5, progress: spLine, dash: undefined },
    { key: "custom", label: "Mi índice", values: SERIES.custom, color: "#a78bfa", width: 3.5, progress: ownLine, dash: "10 8" },
  ];

  return (
    <Split
      left={
        <>
          <Kicker delay={2}>Índices de referencia</Kicker>
          <Headline lines={[words("Contra el"), words("*S&P* *500*"), words("o tus índices.")]} size={92} delay={6} />
          <div style={{ marginTop: 44, opacity: chipIn, transform: `translateY(${(1 - chipIn) * 30}px)` }}>
            <div style={{ fontFamily: BODY, fontSize: 22, fontWeight: 700, color: C.muted, marginBottom: 14 }}>Tasa libre de riesgo</div>
            <div style={{ display: "flex", gap: 12 }}>
              <Chip active={toCaucion < 0.5 && frame >= plazo - 4} style={{ fontSize: 22 }}>Plazo fijo 30 días</Chip>
              <Chip active={toCaucion >= 0.5} style={{ fontSize: 22 }}>Caución en pesos</Chip>
            </div>
          </div>
        </>
      }
      right={
        <Card style={{ width: 920, padding: "30px 34px", opacity: panel, transform: `translateX(${(1 - panel) * 60}px)` }}>
          <div style={{ display: "flex", gap: 26, marginBottom: 26, fontSize: 20, fontWeight: 700 }}>
            {lines.map((l) => (
              <div key={l.key} style={{ display: "flex", alignItems: "center", gap: 10, opacity: l.progress > 0 ? 1 : 0.3 }}>
                <span style={{ width: 22, height: 4, borderRadius: 2, background: l.color }} />
                {l.label}
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 10, opacity: rfIn > 0.1 ? 1 : 0.3 }}>
              <span style={{ width: 22, height: 0, borderTop: `3px dashed ${C.green}` }} />
              Libre de riesgo
            </div>
          </div>
          <svg width={CW + 60} height={CH + 40} style={{ overflow: "visible" }}>
            {[0, 0.5, 1].map((v) => (
              <g key={v}>
                <line x1={0} x2={CW} y1={py(v)} y2={py(v)} stroke={C.border} strokeDasharray="4 6" />
                <text x={CW + 12} y={py(v) + 6} fill={C.faint} fontSize={17} fontFamily={BODY}>
                  {v === 0 ? "0%" : `+${v * 100}%`}
                </text>
              </g>
            ))}
            {["01/01/2022", "01/01/2023", "01/01/2024", "01/01/2025", "01/01/2026"].map((label, i) => (
              <text key={label} x={(i / 4) * CW} y={CH + 34} fill={C.faint} fontSize={17} fontFamily={BODY} textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"}>
                {label}
              </text>
            ))}
            <line
              x1={0}
              y1={py(0)}
              x2={CW * rfIn}
              y2={py(rfEnd * rfIn)}
              stroke={C.green}
              strokeWidth={3}
              strokeDasharray="10 8"
              opacity={rfIn}
            />
            {lines.map((l) => {
              if (l.progress <= 0) return null;
              const p = path(l.values, l.progress);
              return (
                <g key={l.key}>
                  <path d={p.d} fill="none" stroke={l.color} strokeWidth={l.width} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={l.dash} />
                  <circle cx={p.x} cy={p.y} r={l.width + 3} fill={l.color} stroke={C.card} strokeWidth={3} />
                  {l.progress >= 1 && (
                    <text x={CW + 12} y={py(l.values[SERIES_MONTHS]) + (l.key === "portfolio" ? -14 : 7)} fill={l.color} fontSize={21} fontWeight={800} fontFamily={BODY}>
                      {signed(l.values[SERIES_MONTHS])}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </Card>
      }
    />
  );
};
