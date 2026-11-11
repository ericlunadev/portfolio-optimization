import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { STRATEGY_WEIGHTS, TICKERS } from "../data";
import { beat, lerp, springAt } from "../motion";
import { C, DISPLAY } from "../theme";
import { Card, GRADIENT, Headline, Kicker, Split, words } from "../ui";

// Labels and descriptions as the app shows them (apps/web/messages/es.json → Strategies).
const ROWS = [
  { label: "Máximo Sharpe", description: "Mejor rendimiento ajustado por riesgo" },
  { label: "Mínimo Riesgo", description: "Menor volatilidad posible" },
  { label: "Paridad de Riesgo", description: "Cada activo aporta la misma cantidad de riesgo" },
  { label: "Black-Litterman", description: "Combina el equilibrio del mercado con el histórico" },
  { label: "Paridad de Riesgo Jerárquica", description: "Agrupa activos por correlación y reparte por ramas" },
  { label: "Valor en Riesgo Condicional", description: "Minimiza la pérdida media en los peores periodos" },
];
const ROW_H = 92;
const BAR_COLORS = [C.blueHi, C.cyan, C.green, C.amber, C.muted, "#a78bfa"];

/** "Una docena de estrategias: máximo Sharpe, mínimo riesgo, paridad de riesgo… Vos elegís." */
export const Strategies: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dozen = beat("strategies", "docena");
  const toSharpe = springAt(frame, fps, beat("strategies", "máximo") - 4, "snappy");
  const toMin = springAt(frame, fps, beat("strategies", "mínimo") - 4, "snappy");
  const toParity = springAt(frame, fps, beat("strategies", "paridad") - 4, "snappy");
  const choose = beat("strategies", "vos");
  const check = springAt(frame, fps, choose + 4, "bouncy");

  const count = Math.round(lerp(frame, [dozen - 6, dozen + 18], [0, 12]));
  const highlightIndex = toMin + toParity; // 0 → 1 → 2, continuous between beats
  const { sharpe, minRisk, parity } = STRATEGY_WEIGHTS;
  const weights = sharpe.map((w, i) => w + (minRisk[i] - w) * toMin + (parity[i] - minRisk[i]) * toParity);

  return (
    <Split
      left={
        <>
          <Kicker delay={2}>Estrategias</Kicker>
          <div
            style={{
              fontFamily: DISPLAY,
              fontWeight: 700,
              fontSize: 240,
              lineHeight: 0.9,
              letterSpacing: -10,
              backgroundImage: GRADIENT,
              WebkitBackgroundClip: "text",
              color: "transparent",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {count}
          </div>
          <Headline lines={[words("estrategias.")]} size={96} delay={dozen + 4} />
          <div style={{ height: 20 }} />
          <Headline lines={[words("*Vos* *elegís.*")]} size={96} delay={choose - 2} />
        </>
      }
      right={
        <Card style={{ width: 920, padding: 32, display: "flex", gap: 32, opacity: toSharpe, transform: `translateX(${(1 - toSharpe) * 60}px)` }}>
          <div style={{ position: "relative", width: 520 }}>
            {/* Selection pill */}
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: highlightIndex * ROW_H,
                height: ROW_H - 10,
                borderRadius: 18,
                border: `2px solid ${C.blueHi}`,
                background: "rgba(37,99,255,0.16)",
                boxShadow: "0 0 40px rgba(37,99,255,0.25)",
              }}
            />
            {ROWS.map((row, i) => {
              const active = Math.max(0, 1 - Math.abs(highlightIndex - i));
              const enter = springAt(frame, fps, beat("strategies", "máximo") - 10 + i * 3);
              return (
                <div
                  key={row.label}
                  style={{
                    position: "relative",
                    height: ROW_H - 10,
                    marginBottom: 10,
                    padding: "14px 20px",
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    opacity: enter,
                    transform: `translateY(${(1 - enter) * 20}px)`,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 26, fontWeight: 800, color: active > 0.5 ? C.fg : C.muted }}>{row.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 500, color: C.faint, marginTop: 4 }}>{row.description}</div>
                  </div>
                  {i === 2 && (
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        background: C.green,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transform: `scale(${check})`,
                      }}
                    >
                      <svg width={22} height={22} viewBox="0 0 24 24">
                        <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke={C.bg} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  )}
                </div>
              );
            })}
            <div style={{ fontSize: 20, fontWeight: 700, color: C.faint, paddingLeft: 20 }}>+ 6 estrategias más</div>
          </div>
          <div style={{ flex: 1, borderLeft: `1px solid ${C.border}`, paddingLeft: 30 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.muted, letterSpacing: 2, textTransform: "uppercase", marginBottom: 26 }}>
              Pesos
            </div>
            {TICKERS.map((ticker, i) => (
              <div key={ticker} style={{ marginBottom: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 21, fontWeight: 700, marginBottom: 8 }}>
                  <span>{ticker}</span>
                  <span style={{ color: C.muted, fontVariantNumeric: "tabular-nums" }}>{Math.round(weights[i])}%</span>
                </div>
                <div style={{ height: 12, borderRadius: 6, background: C.border }}>
                  <div style={{ width: `${weights[i] * 2.6}%`, height: "100%", borderRadius: 6, background: BAR_COLORS[i] }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      }
    />
  );
};
