"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { StationFrame } from "./StationFrame";
import { getStation } from "./lessons";
import { cn } from "@/lib/utils";

// Illustrative correlation matrix
const TICKERS = ["ALPHA", "BETA", "GAMMA", "DELTA"];

const CORRELATIONS: number[][] = [
  [1.0, 0.82, 0.15, -0.1],
  [0.82, 1.0, 0.3, 0.05],
  [0.15, 0.3, 1.0, 0.6],
  [-0.1, 0.05, 0.6, 1.0],
];

function corrColor(v: number): string {
  // v in [-1, 1]; red = positive, blue-ish = negative
  const abs = Math.abs(v);
  if (v > 0) {
    const alpha = abs * 0.7 + 0.05;
    return `hsl(0 65% 55% / ${alpha})`;
  } else {
    const alpha = abs * 0.7 + 0.05;
    return `hsl(200 55% 55% / ${alpha})`;
  }
}

// Illustrative efficient frontier points
const FRONTIER_POINTS = Array.from({ length: 30 }, (_, i) => {
  const t = i / 29;
  const risk = 5 + t * 25;
  const ret = 3 + Math.sqrt(t) * 14 - t * t * 3;
  return { risk, ret };
});

const RANDOM_PORTFOLIOS = Array.from({ length: 80 }, () => {
  const risk = 6 + Math.random() * 22;
  const maxRet = 3 + Math.sqrt((risk - 5) / 25) * 14 - ((risk - 5) / 25) ** 2 * 3;
  const ret = maxRet - Math.random() * 5;
  return { risk, ret };
});

const OPTIMAL = { risk: 14, ret: 10.5 };

export function Station5Portfolio({ id }: { id: string }) {
  const t = useTranslations("Academia.Station5");
  const tLessons = useTranslations("Academia.Lessons");
  const station = getStation("portfolio");
  const [hovered, setHovered] = useState<{ i: number; j: number } | null>(null);

  return (
    <StationFrame station={station} id={id}>
      <div className="space-y-8">
        <p className="max-w-3xl text-muted-foreground leading-relaxed">
          {tLessons(`${station.key}.summary`)}
        </p>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Correlation matrix */}
          <div className="glass-card p-6 space-y-4">
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                {t("correlationKicker")}
              </div>
              <h3 className="font-display text-xl">{t("correlationTitle")}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("correlationDescription")}
              </p>
            </div>

            <div className="mx-auto w-fit">
              <table className="border-collapse">
                <thead>
                  <tr>
                    <th></th>
                    {TICKERS.map((tk) => (
                      <th
                        key={tk}
                        className="px-2 py-1 text-[10px] font-mono text-muted-foreground"
                      >
                        {tk}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {CORRELATIONS.map((row, i) => (
                    <tr key={i}>
                      <td className="pr-2 text-right text-[10px] font-mono text-muted-foreground">
                        {TICKERS[i]}
                      </td>
                      {row.map((v, j) => (
                        <td
                          key={j}
                          className="p-0.5"
                          onMouseEnter={() => setHovered({ i, j })}
                          onMouseLeave={() => setHovered(null)}
                        >
                          <motion.div
                            className={cn(
                              "flex h-11 w-11 items-center justify-center rounded-md border text-xs font-medium cursor-pointer",
                              i === j ? "border-primary/40" : "border-border/50",
                            )}
                            style={{
                              background: i === j ? "hsl(38 65% 55% / 0.15)" : corrColor(v),
                              color: "hsl(40 6% 90%)",
                            }}
                            whileHover={{ scale: 1.1 }}
                          >
                            {v.toFixed(2)}
                          </motion.div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="min-h-[2.5rem] text-xs text-muted-foreground italic">
              {hovered && hovered.i !== hovered.j ? (
                <span>
                  <span className="font-mono text-foreground">
                    {TICKERS[hovered.i]} · {TICKERS[hovered.j]}
                  </span>
                  {" — "}
                  {CORRELATIONS[hovered.i][hovered.j] > 0.5
                    ? t("correlationHighPositive")
                    : CORRELATIONS[hovered.i][hovered.j] < 0
                      ? t("correlationNegative")
                      : t("correlationLow")}
                </span>
              ) : (
                <span>{t("correlationHoverHint")}</span>
              )}
            </div>
          </div>

          {/* Mini efficient frontier */}
          <div className="glass-card p-6 space-y-4">
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                {t("frontierKicker")}
              </div>
              <h3 className="font-display text-xl">{t("frontierTitle")}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("frontierDescription")}
              </p>
            </div>

            <svg viewBox="0 0 100 100" className="w-full aspect-square">
              {/* Axes */}
              <line x1="10" y1="90" x2="95" y2="90" stroke="hsl(230 12% 22%)" strokeWidth="0.3" />
              <line x1="10" y1="10" x2="10" y2="90" stroke="hsl(230 12% 22%)" strokeWidth="0.3" />

              <text x="52" y="98" textAnchor="middle" fill="hsl(230 8% 50%)" style={{ fontSize: "3px" }}>
                {t("axisRisk")}
              </text>
              <text
                x="4"
                y="50"
                textAnchor="middle"
                fill="hsl(230 8% 50%)"
                style={{ fontSize: "3px" }}
                transform="rotate(-90 4 50)"
              >
                {t("axisReturn")}
              </text>

              {/* Random portfolio cloud */}
              {RANDOM_PORTFOLIOS.map((p, i) => {
                const cx = 10 + (p.risk / 35) * 85;
                const cy = 90 - (p.ret / 17) * 80;
                return (
                  <circle
                    key={i}
                    cx={cx}
                    cy={cy}
                    r="0.6"
                    fill="hsl(230 12% 35%)"
                    opacity="0.5"
                  />
                );
              })}

              {/* Frontier curve */}
              <motion.path
                d={FRONTIER_POINTS.map((p, i) => {
                  const x = 10 + (p.risk / 35) * 85;
                  const y = 90 - (p.ret / 17) * 80;
                  return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
                }).join(" ")}
                fill="none"
                stroke="hsl(38 65% 55%)"
                strokeWidth="0.8"
                initial={{ pathLength: 0 }}
                whileInView={{ pathLength: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 1.5, ease: "easeInOut" }}
              />

              {/* Optimal point */}
              <motion.g
                initial={{ opacity: 0, scale: 0 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 1.4, type: "spring", stiffness: 150 }}
              >
                {(() => {
                  const cx = 10 + (OPTIMAL.risk / 35) * 85;
                  const cy = 90 - (OPTIMAL.ret / 17) * 80;
                  return (
                    <>
                      <circle cx={cx} cy={cy} r="3" fill="hsl(38 65% 55%)" opacity="0.2">
                        <animate
                          attributeName="r"
                          values="2;4;2"
                          dur="2s"
                          repeatCount="indefinite"
                        />
                      </circle>
                      <circle cx={cx} cy={cy} r="1.3" fill="hsl(38 65% 55%)" />
                      <text
                        x={cx + 4}
                        y={cy + 1}
                        fill="hsl(38 65% 65%)"
                        style={{ fontSize: "3px", fontFamily: "var(--font-display)" }}
                      >
                        {t("maxSharpeLabel")}
                      </text>
                    </>
                  );
                })()}
              </motion.g>
            </svg>

            <p className="text-xs text-muted-foreground italic">
              {t("frontierCaption")}
            </p>
          </div>
        </div>

        <ul className="grid gap-2 text-sm text-muted-foreground md:grid-cols-3">
          {[1, 2, 3].map((n) => {
            const text = tLessons(`${station.key}.bullet${n}`);
            return (
              <li key={n} className="flex gap-2 glass-card p-3">
                <span className="text-primary/60">→</span>
                <span>{text}</span>
              </li>
            );
          })}
        </ul>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="glass-card p-8 border-primary/40 glow-gold text-center space-y-4"
        >
          <h3 className="font-display text-2xl md:text-3xl">
            {t("ctaTitle")}
          </h3>
          <p className="mx-auto max-w-xl text-sm text-muted-foreground">
            {t("ctaDescription")}
          </p>
          <Link
            href="/efficient-frontier/new"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110"
          >
            <Zap className="h-4 w-4" />
            {t("ctaButton")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </motion.div>
      </div>
    </StationFrame>
  );
}
