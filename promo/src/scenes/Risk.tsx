import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { DRAWDOWN, DRAWDOWN_WEEKS, MAX_DRAWDOWN, MAX_SHARPE, PROB_LOSS } from "../data";
import { beat, lerp, pct, springAt } from "../motion";
import { BODY, C, DISPLAY } from "../theme";
import { Card, Headline, Kicker, Split, words } from "../ui";

const CW = 860;
const CH = 300;

const Metric: React.FC<{ label: string; value: string; color: string; start: number; children?: React.ReactNode }> = ({ label, value, color, start, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = springAt(frame, fps, start - 6, "bouncy");
  return (
    <div
      style={{
        flex: 1,
        padding: "22px 24px",
        borderRadius: 20,
        border: `1px solid ${s > 0.5 ? color + "88" : C.border}`,
        background: C.bg,
        opacity: Math.min(1, s * 1.4),
        transform: `translateY(${(1 - s) * 40}px) scale(${0.9 + s * 0.1})`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ fontSize: 19, fontWeight: 700, color: C.muted }}>{label}</div>
      <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 60, color, marginTop: 8, letterSpacing: -2, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {children}
    </div>
  );
};

/** "Y medís el riesgo en serio: volatilidad, caída máxima y probabilidad de perder." */
export const Risk: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const vol = beat("risk", "volatilidad");
  const drop = beat("risk", "caída");
  const prob = beat("risk", "probabilidad");

  const countVol = lerp(frame, [vol - 4, vol + 18], [0, MAX_SHARPE.sigma * 100]);
  const countDrop = lerp(frame, [drop - 4, drop + 18], [0, MAX_DRAWDOWN * 100]);
  const countProb = lerp(frame, [prob - 4, prob + 18], [0, PROB_LOSS * 100]);
  const draw = lerp(frame, [vol, drop + 16], [0, 1]);
  const panel = springAt(frame, fps, 4);

  const minDD = MAX_DRAWDOWN * 1.15;
  const px = (i: number) => (i / DRAWDOWN_WEEKS) * CW;
  const py = (dd: number) => (dd / minDD) * (CH - 40) + 20;
  const visible = Math.max(1, Math.round(draw * DRAWDOWN_WEEKS));
  const pts = DRAWDOWN.slice(0, visible + 1).map((d, i) => `${px(i).toFixed(1)},${py(d).toFixed(1)}`);
  const area = `M0,${py(0)} L${pts.join(" L")} L${px(visible)},${py(0)} Z`;
  const troughIndex = DRAWDOWN.indexOf(MAX_DRAWDOWN);
  const troughShown = springAt(frame, fps, drop + 14, "bouncy") * (visible >= troughIndex ? 1 : 0);

  // Tiny return distribution with the loss tail shaded, for the third card.
  const bell = Array.from({ length: 41 }, (_, i) => {
    const z = (i - 20) / 6.5;
    return { x: i * 6, y: 56 - Math.exp(-z * z / 2) * 50, loss: i < 20 - (MAX_SHARPE.mu / MAX_SHARPE.sigma) * 6.5 };
  });
  const tail = springAt(frame, fps, prob + 8);

  return (
    <Split
      left={
        <>
          <Kicker delay={2}>Análisis de riesgo</Kicker>
          <Headline lines={[words("Riesgo,"), words("medido"), words("*en* *serio.*")]} size={104} delay={6} />
        </>
      }
      right={
        <Card style={{ width: 920, padding: 30, opacity: panel, transform: `translateX(${(1 - panel) * 60}px)` }}>
          <div style={{ display: "flex", gap: 18 }}>
            <Metric label="Volatilidad anual" value={pct(countVol)} color={C.cyan} start={vol} />
            <Metric label="Caída máxima" value={pct(countDrop)} color={C.red} start={drop} />
            <Metric label="Prob. de perder (12 m)" value={pct(countProb)} color={C.amber} start={prob}>
              <svg width={246} height={60} style={{ position: "absolute", right: 14, bottom: 8, opacity: 0.9 }}>
                <path d={`M${bell.map((p) => `${p.x},${p.y}`).join(" L")}`} fill="none" stroke={C.faint} strokeWidth={2} />
                <path
                  d={`M0,56 L${bell.filter((p) => p.loss).map((p) => `${p.x},${p.y}`).join(" L")} L${bell.filter((p) => p.loss).slice(-1)[0].x},56 Z`}
                  fill={C.amber}
                  opacity={0.55 * tail}
                />
              </svg>
            </Metric>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", margin: "30px 4px 14px", fontSize: 19, fontWeight: 700 }}>
            <span style={{ color: C.muted, letterSpacing: 2, textTransform: "uppercase" }}>Caídas desde máximos</span>
            <span style={{ color: C.faint }}>01/01/2022 – 01/01/2026</span>
          </div>
          <svg width={CW} height={CH} style={{ overflow: "visible" }}>
            <defs>
              <linearGradient id="dd-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.red} stopOpacity={0.05} />
                <stop offset="100%" stopColor={C.red} stopOpacity={0.45} />
              </linearGradient>
            </defs>
            {[0, 0.5, 1].map((f) => (
              <line key={f} x1={0} x2={CW} y1={py(minDD * f / 1.15)} y2={py(minDD * f / 1.15)} stroke={C.border} strokeDasharray="4 6" />
            ))}
            <path d={area} fill="url(#dd-fill)" />
            <path d={`M${pts.join(" L")}`} fill="none" stroke={C.red} strokeWidth={2.5} strokeLinejoin="round" />
            <g transform={`translate(${px(troughIndex)} ${py(MAX_DRAWDOWN)})`} opacity={troughShown}>
              <circle r={9 * troughShown} fill={C.red} stroke={C.bg} strokeWidth={3} />
              <text y={42} textAnchor="middle" fill={C.red} fontSize={22} fontWeight={800} fontFamily={BODY}>
                {pct(MAX_DRAWDOWN * 100)}
              </text>
            </g>
          </svg>
        </Card>
      }
    />
  );
};
