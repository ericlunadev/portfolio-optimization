import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { CLOUD, FRONTIER_MU, MAX_SHARPE, RISK_FREE, TICKERS, sigmaFor } from "../data";
import { beat, lerp, pct, springAt } from "../motion";
import { BODY, C } from "../theme";
import { Card, Chip, GRADIENT, Headline, Kicker, Split, words } from "../ui";

const W = 820;
const H = 440;
const PAD = { l: 64, r: 20, t: 20, b: 52 };
const SIGMA_RANGE: [number, number] = [0.06, 0.4];
// Headroom above the curve holds the max-Sharpe tooltip clear of the data.
const MU_RANGE: [number, number] = [0, 0.52];
const x = (sigma: number) => PAD.l + ((sigma - SIGMA_RANGE[0]) / (SIGMA_RANGE[1] - SIGMA_RANGE[0])) * (W - PAD.l - PAD.r);
const y = (mu: number) => H - PAD.b - ((mu - MU_RANGE[0]) / (MU_RANGE[1] - MU_RANGE[0])) * (H - PAD.t - PAD.b);

const frontierPath = (() => {
  const points: string[] = [];
  for (let mu = FRONTIER_MU[0]; mu <= FRONTIER_MU[1] + 1e-9; mu += 0.004) {
    points.push(`${points.length ? "L" : "M"}${x(sigmaFor(mu)).toFixed(1)} ${y(mu).toFixed(1)}`);
  }
  return points.join(" ");
})();
const FRONTIER_LENGTH = 900;

/** "Cargás tus activos… la combinación óptima, sobre la frontera eficiente." */
export const Frontier: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const load = beat("frontier", "cargás");
  const press = beat("frontier", "y");
  const seconds = beat("frontier", "segundos");
  const optimal = beat("frontier", "óptima");
  const frontierWord = beat("frontier", "frontera");

  const pressDip = lerp(frame, [press, press + 4], [0, 1]) * lerp(frame, [press + 4, press + 10], [1, 0]);
  const progress = lerp(frame, [press + 4, seconds + 14], [0, 1]);
  const scanDone = springAt(frame, fps, seconds + 14);
  const draw = lerp(frame, [seconds + 12, optimal + 4], [0, 1]);
  const star = springAt(frame, fps, optimal, "bouncy");
  const tip = springAt(frame, fps, optimal + 8, "snappy");
  const cml = lerp(frame, [frontierWord - 4, frontierWord + 16], [0, 1]);
  const label = springAt(frame, fps, frontierWord);
  const pulse = (frame - optimal) / 30;

  const sx = x(MAX_SHARPE.sigma);
  const sy = y(MAX_SHARPE.mu);
  // Capital market line from the risk-free rate through the tangent point.
  const cmlEnd = { mu: 0.36, sigma: ((0.36 - RISK_FREE) / MAX_SHARPE.sharpe) };

  return (
    <Split
      left={
        <>
          <Kicker delay={2}>Frontera eficiente · Markowitz</Kicker>
          <Headline lines={[words("La combinación"), words("*óptima,*"), words("en segundos.")]} size={96} delay={6} />
        </>
      }
      right={
        <Card style={{ width: 900, padding: 36 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.muted, letterSpacing: 2, textTransform: "uppercase" }}>Tus activos</div>
            <div
              style={{
                fontFamily: BODY,
                fontWeight: 800,
                fontSize: 22,
                padding: "14px 30px",
                borderRadius: 14,
                background: GRADIENT,
                color: "white",
                transform: `scale(${1 - pressDip * 0.08})`,
                boxShadow: `0 0 ${30 + pressDip * 40}px rgba(37,99,255,${0.35 + pressDip * 0.4})`,
              }}
            >
              {progress > 0 && progress < 1 ? "Calculando…" : "Optimizar"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", minHeight: 58 }}>
            {TICKERS.map((ticker, i) => {
              const s = springAt(frame, fps, load + i * 4, "bouncy");
              return (
                <div key={ticker} style={{ transform: `translateY(${(1 - s) * -60}px) scale(${0.6 + s * 0.4})`, opacity: Math.min(1, s * 1.5) }}>
                  <Chip>
                    <span style={{ width: 10, height: 10, borderRadius: 5, background: [C.blueHi, C.cyan, C.green, C.amber, C.muted, "#a78bfa"][i] }} />
                    {ticker}
                  </Chip>
                </div>
              );
            })}
          </div>
          {/* Loader */}
          <div style={{ height: 6, borderRadius: 3, background: C.border, margin: "22px 0 18px", overflow: "hidden", opacity: 1 - scanDone }}>
            <div style={{ width: `${progress * 100}%`, height: "100%", background: GRADIENT }} />
          </div>
          <svg width={W} height={H} style={{ overflow: "visible" }}>
            <defs>
              <linearGradient id="frontier-stroke" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0%" stopColor={C.blueHi} />
                <stop offset="100%" stopColor={C.cyan} />
              </linearGradient>
            </defs>
            {/* Grid + axes */}
            {[0, 0.1, 0.2, 0.3, 0.4].map((mu) => (
              <g key={mu} opacity={0.5 + scanDone * 0.5}>
                <line x1={PAD.l} x2={W - PAD.r} y1={y(mu)} y2={y(mu)} stroke={C.border} strokeDasharray="4 6" />
                <text x={PAD.l - 14} y={y(mu) + 7} fill={C.faint} fontSize={18} textAnchor="end" fontFamily={BODY}>
                  {Math.round(mu * 100)}%
                </text>
              </g>
            ))}
            {[0.1, 0.2, 0.3, 0.4].map((sigma) => (
              <text key={sigma} x={x(sigma)} y={H - PAD.b + 30} fill={C.faint} fontSize={18} textAnchor="middle" fontFamily={BODY}>
                {Math.round(sigma * 100)}%
              </text>
            ))}
            <text x={W - PAD.r} y={H - 2} fill={C.muted} fontSize={18} textAnchor="end" fontFamily={BODY} fontWeight={700}>
              Riesgo (volatilidad)
            </text>
            <text x={PAD.l} y={PAD.t - 2} fill={C.muted} fontSize={18} fontFamily={BODY} fontWeight={700}>
              Rendimiento esperado
            </text>
            {/* Simulated portfolios */}
            {CLOUD.map((p, i) => {
              const s = springAt(frame, fps, press + 8 + (i % 60) * 0.6 + Math.floor(i / 60) * 6, "snappy");
              return <circle key={i} cx={x(p.sigma)} cy={y(p.mu)} r={5 * s} fill={C.blueHi} opacity={0.32 * s} />;
            })}
            {/* Capital market line */}
            <line
              x1={x(0.06)}
              y1={y(RISK_FREE + MAX_SHARPE.sharpe * 0.06)}
              x2={x(0.06) + (x(cmlEnd.sigma) - x(0.06)) * cml}
              y2={y(RISK_FREE + MAX_SHARPE.sharpe * 0.06) + (y(cmlEnd.mu) - y(RISK_FREE + MAX_SHARPE.sharpe * 0.06)) * cml}
              stroke={C.green}
              strokeWidth={2.5}
              strokeDasharray="8 8"
              opacity={0.8}
            />
            {/* Frontier */}
            <path
              d={frontierPath}
              fill="none"
              stroke="url(#frontier-stroke)"
              strokeWidth={5}
              strokeLinecap="round"
              strokeDasharray={FRONTIER_LENGTH}
              strokeDashoffset={FRONTIER_LENGTH * (1 - draw)}
            />
            <g opacity={label} transform={`translate(${x(sigmaFor(0.34)) + 14} ${y(0.34) + 6})`}>
              <text fill={C.cyan} fontSize={20} fontFamily={BODY} fontWeight={800}>
                Frontera eficiente
              </text>
            </g>
            {/* Max-Sharpe star */}
            <g transform={`translate(${sx} ${sy})`}>
              {star > 0.01 && (
                <circle r={14 + (pulse % 1) * 30} fill="none" stroke={C.green} strokeWidth={2} opacity={(1 - (pulse % 1)) * 0.8 * star} />
              )}
              <circle r={14 * star} fill={C.green} stroke={C.bg} strokeWidth={4} />
            </g>
            <line x1={sx} y1={sy - 16} x2={sx} y2={sy - 16 - 30 * tip} stroke={C.green} strokeWidth={2} opacity={tip} />
            <g opacity={tip} transform={`translate(${sx - 60} ${PAD.t + 18 + (1 - tip) * 16})`}>
              <rect width={430} height={84} rx={16} fill={C.bg} stroke={C.green} strokeOpacity={0.6} />
              <text x={20} y={34} fill={C.green} fontSize={22} fontFamily={BODY} fontWeight={800}>
                Máximo Sharpe{" "}
                <tspan fill={C.muted} fontWeight={600} fontSize={19}>
                  · Sharpe {MAX_SHARPE.sharpe.toFixed(2).replace(".", ",")}
                </tspan>
              </text>
              <text x={20} y={64} fill={C.fg} fontSize={19} fontFamily={BODY} fontWeight={600}>
                Rendimiento {pct(MAX_SHARPE.mu * 100)} · Riesgo {pct(MAX_SHARPE.sigma * 100)}
              </text>
            </g>
          </svg>
        </Card>
      }
    />
  );
};
