"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { StationFrame } from "./StationFrame";
import { getStation } from "./lessons";
import { cn } from "@/lib/utils";

interface Candidate {
  ticker: string;
  nameKey: "alphaName" | "betaName" | "deltaName";
  moat: number; // 0-100
  valuation: number; // 0-100 (100 = very cheap)
  balance: number; // 0-100
  trend: "up" | "down" | "sideways";
  rsi: number; // 0-100
  priceSeed: number;
}

const CANDIDATES: Candidate[] = [
  {
    ticker: "ALPHA",
    nameKey: "alphaName",
    moat: 82,
    valuation: 55,
    balance: 75,
    trend: "up",
    rsi: 58,
    priceSeed: 1,
  },
  {
    ticker: "BETA",
    nameKey: "betaName",
    moat: 70,
    valuation: 28,
    balance: 68,
    trend: "up",
    rsi: 78,
    priceSeed: 2,
  },
  {
    ticker: "DELTA",
    nameKey: "deltaName",
    moat: 35,
    valuation: 82,
    balance: 42,
    trend: "down",
    rsi: 32,
    priceSeed: 3,
  },
];

function generatePricePath(seed: number, trend: "up" | "down" | "sideways"): string {
  const n = 30;
  const points: Array<[number, number]> = [];
  let value = 50;
  for (let i = 0; i <= n; i++) {
    const noise = Math.sin(i * 1.3 + seed) * 3 + Math.cos(i * 0.7 + seed * 2) * 2;
    const drift = trend === "up" ? 0.9 : trend === "down" ? -0.7 : 0;
    value += drift + noise * 0.4;
    points.push([i / n, value]);
  }
  const minV = Math.min(...points.map((p) => p[1]));
  const maxV = Math.max(...points.map((p) => p[1]));
  const range = maxV - minV || 1;
  return points
    .map(([x, y], i) => {
      const xp = x * 100;
      const yp = 100 - ((y - minV) / range) * 80 - 10;
      return `${i === 0 ? "M" : "L"} ${xp.toFixed(2)} ${yp.toFixed(2)}`;
    })
    .join(" ");
}

function Gauge({ value, label }: { value: number; label: string }) {
  const color =
    value >= 70
      ? "hsl(38 65% 55%)"
      : value >= 45
        ? "hsl(40 50% 55%)"
        : "hsl(0 60% 55%)";

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground uppercase tracking-wider">{label}</span>
        <span className="font-medium" style={{ color }}>
          {value}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ type: "spring", stiffness: 70, damping: 18 }}
        />
      </div>
    </div>
  );
}

export function Station4Assets({ id }: { id: string }) {
  const t = useTranslations("Academia.Station4");
  const tLessons = useTranslations("Academia.Lessons");
  const station = getStation("assets");
  const [active, setActive] = useState<string>(CANDIDATES[0].ticker);
  const candidate = CANDIDATES.find((c) => c.ticker === active)!;

  const fundamentalScore = Math.round(
    (candidate.moat + candidate.valuation + candidate.balance) / 3,
  );
  const technicalScore = Math.round(
    candidate.trend === "up"
      ? (100 - Math.abs(candidate.rsi - 55)) * 0.9
      : candidate.trend === "down"
        ? 25
        : 50,
  );

  const passesFundamental = fundamentalScore >= 60;
  const passesTechnical = technicalScore >= 55;
  const passesBoth = passesFundamental && passesTechnical;

  const pricePath = useMemo(
    () => generatePricePath(candidate.priceSeed, candidate.trend),
    [candidate.priceSeed, candidate.trend],
  );

  const trendLabel =
    candidate.trend === "up"
      ? t("trendUp")
      : candidate.trend === "down"
        ? t("trendDown")
        : t("trendSideways");

  const rsiState =
    candidate.rsi >= 70
      ? t("rsiOverbought")
      : candidate.rsi <= 30
        ? t("rsiOversold")
        : t("rsiNeutral");

  const verdict = passesBoth
    ? t("verdictPassBoth")
    : passesFundamental
      ? t("verdictPassFundamental")
      : passesTechnical
        ? t("verdictPassTechnical")
        : t("verdictFail");

  return (
    <StationFrame station={station} id={id}>
      <div className="space-y-8">
        <p className="max-w-3xl text-muted-foreground leading-relaxed">
          {tLessons(`${station.key}.summary`)}
        </p>

        {/* Candidate selector */}
        <div className="flex flex-wrap gap-2">
          {CANDIDATES.map((c) => (
            <button
              key={c.ticker}
              onClick={() => setActive(c.ticker)}
              className={cn(
                "rounded-lg border px-4 py-2 text-sm transition-all",
                active === c.ticker
                  ? "border-primary/50 bg-primary/10 text-primary glow-gold"
                  : "border-border/50 bg-card/40 text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              <span className="font-mono">{c.ticker}</span>
            </button>
          ))}
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Fundamental */}
          <motion.div
            layout
            className={cn(
              "glass-card p-6 space-y-4 border-2 transition-colors",
              passesFundamental ? "border-primary/40" : "border-destructive/30",
            )}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground">
                  {t("fundamentalKicker")}
                </div>
                <h3 className="font-display text-xl">{t("fundamentalTitle")}</h3>
              </div>
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium",
                  passesFundamental
                    ? "bg-primary/15 text-primary"
                    : "bg-destructive/10 text-destructive",
                )}
              >
                {passesFundamental ? t("passes") : t("fails")}
              </span>
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={candidate.ticker}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-3"
              >
                <Gauge value={candidate.moat} label={t("moatLabel")} />
                <Gauge value={candidate.valuation} label={t("valuationLabel")} />
                <Gauge value={candidate.balance} label={t("balanceLabel")} />
              </motion.div>
            </AnimatePresence>
            <p className="text-xs text-muted-foreground italic">
              {t(candidate.nameKey)}
            </p>
          </motion.div>

          {/* Technical */}
          <motion.div
            layout
            className={cn(
              "glass-card p-6 space-y-4 border-2 transition-colors",
              passesTechnical ? "border-primary/40" : "border-destructive/30",
            )}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground">
                  {t("technicalKicker")}
                </div>
                <h3 className="font-display text-xl">{t("technicalTitle")}</h3>
              </div>
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium",
                  passesTechnical
                    ? "bg-primary/15 text-primary"
                    : "bg-destructive/10 text-destructive",
                )}
              >
                {passesTechnical ? t("passes") : t("fails")}
              </span>
            </div>

            <svg viewBox="0 0 100 100" className="w-full h-32" preserveAspectRatio="none">
              {/* Support/resistance guide */}
              <line x1="0" y1="25" x2="100" y2="25" stroke="hsl(230 12% 22%)" strokeWidth="0.3" strokeDasharray="1 2" />
              <line x1="0" y1="75" x2="100" y2="75" stroke="hsl(230 12% 22%)" strokeWidth="0.3" strokeDasharray="1 2" />
              <motion.path
                key={candidate.ticker}
                d={pricePath}
                fill="none"
                stroke="hsl(38 65% 55%)"
                strokeWidth="0.8"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1, ease: "easeInOut" }}
              />
            </svg>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {t("trendLabel")}
                </div>
                <div
                  className={cn(
                    "font-medium",
                    candidate.trend === "up"
                      ? "text-primary"
                      : candidate.trend === "down"
                        ? "text-destructive"
                        : "text-muted-foreground",
                  )}
                >
                  {trendLabel}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {t("rsiLabel")}
                </div>
                <div
                  className={cn(
                    "font-medium",
                    candidate.rsi >= 70 || candidate.rsi <= 30
                      ? "text-destructive"
                      : "text-primary",
                  )}
                >
                  {candidate.rsi}{" "}
                  <span className="text-xs text-muted-foreground">
                    {rsiState}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Verdict */}
        <motion.div
          layout
          className={cn(
            "glass-card p-5 flex items-center justify-between border-2",
            passesBoth
              ? "border-primary/50 glow-gold"
              : "border-border/50",
          )}
        >
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">
              {t("verdictLabel")}
            </div>
            <div className={cn(
              "font-display text-xl",
              passesBoth ? "text-primary" : "text-foreground/60",
            )}>
              {verdict}
            </div>
          </div>
          <div className="flex gap-2">
            <span className={cn(
              "text-2xl",
              passesFundamental ? "text-primary" : "text-destructive/60",
            )}>
              {passesFundamental ? "✓" : "✗"}
            </span>
            <span className={cn(
              "text-2xl",
              passesTechnical ? "text-primary" : "text-destructive/60",
            )}>
              {passesTechnical ? "✓" : "✗"}
            </span>
          </div>
        </motion.div>

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
      </div>
    </StationFrame>
  );
}
