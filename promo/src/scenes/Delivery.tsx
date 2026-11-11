import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { STRATEGY_WEIGHTS, TICKERS } from "../data";
import { beat, lerp, springAt } from "../motion";
import { BODY, C, DISPLAY } from "../theme";
import { Card, GRADIENT, Headline, Kicker, Mark, Split, words } from "../ui";

const CADENCES = ["Diario", "Semanal", "Mensual"];
const BAR_COLORS = [C.blueHi, C.cyan, C.green, C.amber, C.muted, "#a78bfa"];

/** "Bajás el reporte en PDF, o programás que se actualice solo y te llegue al mail." */
export const Delivery: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const report = beat("delivery", "reporte");
  const pdf = beat("delivery", "pdf");
  const schedule = beat("delivery", "programás");
  const update = beat("delivery", "actualice");
  const mail = beat("delivery", "mail");

  const doc = springAt(frame, fps, report - 10, "snappy");
  const download = lerp(frame, [pdf, pdf + 6], [0, 1]) * lerp(frame, [pdf + 6, pdf + 14], [1, 0]);
  const downloaded = springAt(frame, fps, pdf + 10, "bouncy");
  const scheduler = springAt(frame, fps, schedule - 6, "snappy");
  const toMonthly = springAt(frame, fps, update - 2, "snappy");
  const toast = springAt(frame, fps, mail - 12, "bouncy");
  const pillIndex = 1 + toMonthly; // Semanal → Mensual

  return (
    <Split
      left={
        <>
          <Kicker delay={2}>Reportes y envíos programados</Kicker>
          <Headline lines={[words("Tu reporte,"), words("en *PDF* o"), words("en tu *mail.*")]} size={96} delay={6} />
        </>
      }
      right={
        <div style={{ position: "relative", width: 920, height: 760 }}>
          {/* PDF report */}
          <div
            style={{
              position: "absolute",
              left: 20,
              top: 160,
              transform: `translateY(${(1 - doc) * 120}px) rotate(${-4 + (1 - doc) * -6 - scheduler * 2}deg) scale(${1 - scheduler * 0.06})`,
              opacity: doc,
            }}
          >
            <div style={{ width: 430, height: 580, borderRadius: 18, background: "#f8fbff", padding: 30, boxShadow: "0 50px 90px -30px rgba(0,0,0,0.8)", fontFamily: BODY, color: C.bg }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Mark size={34} />
                <div style={{ fontFamily: DISPLAY, fontSize: 22 }}>
                  <span style={{ fontWeight: 300, opacity: 0.7 }}>Pronto</span>
                  <span style={{ fontWeight: 700, color: C.blue }}>Folio</span>
                </div>
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, marginTop: 22 }}>Reporte de optimización</div>
              <div style={{ fontSize: 15, color: "#475569", marginTop: 4 }}>Máximo Sharpe · 11/11/2026</div>
              <svg width={370} height={150} style={{ marginTop: 18 }}>
                <path d="M10 140 C 40 60, 120 30, 360 14" fill="none" stroke={C.blue} strokeWidth={4} />
                {Array.from({ length: 40 }, (_, i) => (
                  <circle key={i} cx={30 + ((i * 53) % 320)} cy={60 + ((i * 37) % 80)} r={3.5} fill={C.blue} opacity={0.25} />
                ))}
                <circle cx={150} cy={36} r={8} fill={C.green} />
              </svg>
              {TICKERS.map((ticker, i) => (
                <div key={ticker} style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, fontSize: 15, fontWeight: 700 }}>
                  <span style={{ width: 48 }}>{ticker}</span>
                  <div style={{ flex: 1, height: 9, borderRadius: 5, background: "#e2e8f0" }}>
                    <div style={{ width: `${STRATEGY_WEIGHTS.sharpe[i] * 3}%`, height: "100%", borderRadius: 5, background: BAR_COLORS[i] }} />
                  </div>
                  <span style={{ width: 36, textAlign: "right", color: "#475569" }}>{STRATEGY_WEIGHTS.sharpe[i]}%</span>
                </div>
              ))}
            </div>
            {/* Download button */}
            <div
              style={{
                position: "absolute",
                right: -26,
                top: -26,
                width: 104,
                height: 104,
                borderRadius: 52,
                background: downloaded > 0.5 ? C.green : GRADIENT,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transform: `scale(${(0.6 + doc * 0.4) * (1 - download * 0.12) * (1 + (downloaded - Math.min(downloaded, 1)) * 0.5)})`,
                boxShadow: "0 20px 40px -10px rgba(0,0,0,0.6)",
              }}
            >
              <svg width={46} height={46} viewBox="0 0 24 24">
                {downloaded > 0.5 ? (
                  <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="white" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                ) : (
                  <g fill="none" stroke="white" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" transform={`translate(0 ${download * 3})`}>
                    <path d="M12 4v11" />
                    <path d="M7 10.5l5 5 5-5" />
                    <path d="M5 20h14" />
                  </g>
                )}
              </svg>
            </div>
          </div>
          {/* Scheduler */}
          <div style={{ position: "absolute", right: 0, top: 360, opacity: scheduler, transform: `translateX(${(1 - scheduler) * 120}px)` }}>
            <Card style={{ width: 470, padding: 30 }}>
              <div style={{ fontSize: 24, fontWeight: 800 }}>Nuevo envío programado</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.muted, marginTop: 22, marginBottom: 12 }}>Frecuencia</div>
              <div style={{ position: "relative", display: "flex", background: C.bg, borderRadius: 14, padding: 6, border: `1px solid ${C.border}` }}>
                <div
                  style={{
                    position: "absolute",
                    top: 6,
                    bottom: 6,
                    left: 6 + pillIndex * ((470 - 60 - 12) / 3),
                    width: (470 - 60 - 12) / 3,
                    borderRadius: 10,
                    background: GRADIENT,
                  }}
                />
                {CADENCES.map((label, i) => (
                  <div key={label} style={{ position: "relative", flex: 1, textAlign: "center", padding: "12px 0", fontSize: 20, fontWeight: 800, color: Math.abs(pillIndex - i) < 0.5 ? "white" : C.muted }}>
                    {label}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.muted, marginTop: 22 }}>Simulaciones incluidas</div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, fontSize: 20, fontWeight: 700 }}>
                <span style={{ width: 26, height: 26, borderRadius: 7, background: C.blueHi, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width={16} height={16} viewBox="0 0 24 24">
                    <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="white" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                Mi cartera · Máximo Sharpe
              </div>
            </Card>
          </div>
          {/* Email notification */}
          <div
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              opacity: Math.min(1, toast * 1.5),
              transform: `translateY(${(1 - toast) * -90}px) scale(${0.85 + toast * 0.15})`,
            }}
          >
            <div
              style={{
                width: 500,
                display: "flex",
                gap: 18,
                alignItems: "center",
                padding: "20px 24px",
                borderRadius: 24,
                background: "rgba(27,40,72,0.92)",
                border: `1px solid ${C.border}`,
                boxShadow: "0 30px 60px -20px rgba(0,0,0,0.8)",
                fontFamily: BODY,
                color: C.fg,
              }}
            >
              <div style={{ width: 60, height: 60, borderRadius: 16, background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Mark size={38} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 700, color: C.muted }}>
                  <span>ProntoFolio</span>
                  <span>ahora</span>
                </div>
                <div style={{ fontSize: 21, fontWeight: 800, marginTop: 4 }}>Tus simulaciones actualizadas</div>
                <div style={{ fontSize: 18, color: C.muted, marginTop: 2 }}>Revisión mensual de mi cartera</div>
              </div>
            </div>
          </div>
        </div>
      }
    />
  );
};
