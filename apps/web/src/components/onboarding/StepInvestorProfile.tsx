"use client";

import { useTranslations } from "next-intl";
import type {
  ExperienceLevel,
  InvestmentGoal,
  InvestmentHorizon,
  RiskBehavior,
} from "@/lib/api";
import { WhyTooltip } from "./WhyTooltip";

export interface Step2Values {
  experience: ExperienceLevel | "";
  horizon: InvestmentHorizon | "";
  riskBehavior: RiskBehavior | "";
  goal: InvestmentGoal | "";
}

interface Props {
  value: Step2Values;
  onChange: (next: Step2Values) => void;
}

const EXPERIENCE_OPTIONS: ExperienceLevel[] = ["none", "beginner", "intermediate", "advanced"];
const HORIZON_OPTIONS: InvestmentHorizon[] = ["short", "medium", "long"];
const RISK_OPTIONS: RiskBehavior[] = ["sell_all", "sell_some", "hold", "buy_more"];
const GOAL_OPTIONS: InvestmentGoal[] = ["retirement", "growth", "preservation", "specific"];

const EXPERIENCE_KEY: Record<ExperienceLevel, string> = {
  none: "experienceNone",
  beginner: "experienceBeginner",
  intermediate: "experienceIntermediate",
  advanced: "experienceAdvanced",
};

const HORIZON_KEY: Record<InvestmentHorizon, string> = {
  short: "horizonShort",
  medium: "horizonMedium",
  long: "horizonLong",
};

const RISK_KEY: Record<RiskBehavior, string> = {
  sell_all: "riskSellAll",
  sell_some: "riskSellSome",
  hold: "riskHold",
  buy_more: "riskBuyMore",
};

const GOAL_KEY: Record<InvestmentGoal, string> = {
  retirement: "goalRetirement",
  growth: "goalGrowth",
  preservation: "goalPreservation",
  specific: "goalSpecific",
};

function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  labelFor,
  name,
}: {
  options: readonly T[];
  value: T | "";
  onChange: (v: T) => void;
  labelFor: (v: T) => string;
  name: string;
}) {
  return (
    <div role="radiogroup" className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = opt === value;
        return (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt)}
            data-name={name}
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

export function StepInvestorProfile({ value, onChange }: Props) {
  const t = useTranslations("Onboarding.step2");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl text-foreground">{t("title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-foreground">{t("experienceLabel")}</p>
        <ChipGroup
          name="experience"
          options={EXPERIENCE_OPTIONS}
          value={value.experience}
          onChange={(v) => onChange({ ...value, experience: v })}
          labelFor={(v) => t(EXPERIENCE_KEY[v])}
        />
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-foreground">{t("horizonLabel")}</p>
        <ChipGroup
          name="horizon"
          options={HORIZON_OPTIONS}
          value={value.horizon}
          onChange={(v) => onChange({ ...value, horizon: v })}
          labelFor={(v) => t(HORIZON_KEY[v])}
        />
      </div>

      <div>
        <p className="mb-2 flex items-center text-sm font-medium text-foreground">
          {t("riskQuestion")}
          <WhyTooltip content={t("whyRisk")} />
        </p>
        <ChipGroup
          name="riskBehavior"
          options={RISK_OPTIONS}
          value={value.riskBehavior}
          onChange={(v) => onChange({ ...value, riskBehavior: v })}
          labelFor={(v) => t(RISK_KEY[v])}
        />
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-foreground">{t("goalLabel")}</p>
        <ChipGroup
          name="goal"
          options={GOAL_OPTIONS}
          value={value.goal}
          onChange={(v) => onChange({ ...value, goal: v })}
          labelFor={(v) => t(GOAL_KEY[v])}
        />
      </div>
    </div>
  );
}

export function isStep2Valid(v: Step2Values): boolean {
  return v.experience !== "" && v.horizon !== "" && v.riskBehavior !== "" && v.goal !== "";
}
