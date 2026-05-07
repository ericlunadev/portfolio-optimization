"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ConceptKey, MarketCode } from "@/lib/api";
import { WhyTooltip } from "./WhyTooltip";

export interface Step3Values {
  marketsOfInterest: MarketCode[];
  otherMarkets: string[];
  conceptFamiliarity: ConceptKey[];
}

interface Props {
  value: Step3Values;
  onChange: (next: Step3Values) => void;
}

const MARKET_OPTIONS: MarketCode[] = ["MX", "US", "EU", "LATAM", "AR", "CRYPTO"];
const CONCEPT_OPTIONS: ConceptKey[] = ["markowitz", "sharpe", "volatility", "beta", "frontier"];

const MARKET_KEY: Record<MarketCode, string> = {
  MX: "marketMX",
  US: "marketUS",
  EU: "marketEU",
  LATAM: "marketLATAM",
  AR: "marketAR",
  CRYPTO: "marketCRYPTO",
};

const CONCEPT_KEY: Record<ConceptKey, string> = {
  markowitz: "conceptMarkowitz",
  sharpe: "conceptSharpe",
  volatility: "conceptVolatility",
  beta: "conceptBeta",
  frontier: "conceptFrontier",
};

function MultiChip<T extends string>({
  options,
  selected,
  onToggle,
  labelFor,
}: {
  options: readonly T[];
  selected: readonly T[];
  onToggle: (v: T) => void;
  labelFor: (v: T) => string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(opt)}
            className={
              active
                ? "rounded-lg border border-primary bg-primary/15 px-3 py-1.5 text-sm font-medium text-primary"
                : "rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
            }
          >
            {labelFor(opt)}
          </button>
        );
      })}
    </div>
  );
}

function toggle<T>(arr: readonly T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

function parseOtherMarkets(raw: string): string[] {
  const tokens = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.slice(0, 64));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of tokens) {
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(token);
  }
  return out.slice(0, 10);
}

export function StepMarketPreferences({ value, onChange }: Props) {
  const t = useTranslations("Onboarding.step3");
  const [otherInput, setOtherInput] = useState<string>(() => value.otherMarkets.join(", "));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl text-foreground">{t("title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-foreground">{t("marketsLabel")}</p>
        <MultiChip
          options={MARKET_OPTIONS}
          selected={value.marketsOfInterest}
          onToggle={(v) =>
            onChange({ ...value, marketsOfInterest: toggle(value.marketsOfInterest, v) })
          }
          labelFor={(v) => t(MARKET_KEY[v])}
        />
        <p className="mt-1.5 text-xs text-muted-foreground">{t("marketsHint")}</p>

        <div className="mt-4">
          <label
            htmlFor="other-markets"
            className="mb-1.5 block text-sm font-medium text-foreground"
          >
            {t("otherMarketsLabel")}
          </label>
          <input
            id="other-markets"
            type="text"
            value={otherInput}
            placeholder={t("otherMarketsPlaceholder")}
            onChange={(e) => {
              const raw = e.target.value;
              setOtherInput(raw);
              onChange({ ...value, otherMarkets: parseOtherMarkets(raw) });
            }}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">{t("otherMarketsHint")}</p>
        </div>
      </div>

      <div>
        <p className="mb-2 flex items-center text-sm font-medium text-foreground">
          {t("conceptsLabel")}
          <WhyTooltip content={t("whyConcepts")} />
        </p>
        <MultiChip
          options={CONCEPT_OPTIONS}
          selected={value.conceptFamiliarity}
          onToggle={(v) =>
            onChange({ ...value, conceptFamiliarity: toggle(value.conceptFamiliarity, v) })
          }
          labelFor={(v) => t(CONCEPT_KEY[v])}
        />
      </div>
    </div>
  );
}

export function isStep3Valid(v: Step3Values): boolean {
  return v.marketsOfInterest.length + v.otherMarkets.length >= 1;
}
