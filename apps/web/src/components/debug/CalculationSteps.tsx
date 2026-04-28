"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { MatrixTable } from "@/components/tables/MatrixTable";

interface CalculationStepsProps {
  debug: {
    covarianceMatrix: number[][];
    correlationMatrix: number[][];
    calculationSteps: {
      dailyReturns: { ticker: string; returns: number[] }[];
      tickerStats: {
        ticker: string;
        meanDailyReturn: number;
        dailyVolatility: number;
        annualizedReturn: number;
        annualizedVolatility: number;
      }[];
      pairwiseCorrelations: {
        ticker1: string;
        ticker2: string;
        correlation: number;
      }[];
    };
  };
  tickers: string[];
}

function StepCard({
  stepNumber,
  title,
  children,
  defaultOpen = false,
}: {
  stepNumber: number;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="rounded-lg border border-border">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-3 p-4 text-left hover:bg-accent/50"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
          {stepNumber}
        </span>
        <span className="flex-1 font-medium">{title}</span>
        <span className="text-muted-foreground">{isOpen ? "▼" : "▶"}</span>
      </button>
      {isOpen && <div className="border-t border-border p-4">{children}</div>}
    </div>
  );
}

function FormulaBlock({ formula, description }: { formula: string; description: string }) {
  return (
    <div className="my-3 rounded-md bg-muted/50 p-3">
      <code className="block text-center font-mono text-sm">{formula}</code>
      <p className="mt-2 text-center text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

export function CalculationSteps({ debug, tickers }: CalculationStepsProps) {
  const { calculationSteps, correlationMatrix, covarianceMatrix } = debug;
  const t = useTranslations("Debug");

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-blue-600 p-4 dark:bg-blue-800">
        <h3 className="font-semibold text-white">
          {t("headerTitle")}
        </h3>
        <p className="mt-1 text-sm text-blue-100">
          {t("headerSubtitle")}
        </p>
      </div>

      <StepCard stepNumber={1} title={t("step1Title")} defaultOpen>
        <p className="mb-3 text-sm text-muted-foreground">
          {t("step1Body")}
        </p>

        <FormulaBlock
          formula="R_t = ln(P_t / P_{t-1})"
          description={t("step1FormulaDesc")}
        />

        <div className="mt-4 space-y-3">
          {calculationSteps.dailyReturns.map(({ ticker, returns }) => (
            <div key={ticker} className="rounded border border-border/50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium">{ticker}</span>
                <span className="text-xs text-muted-foreground">
                  {t("step1DaysOfData", { count: returns.length })}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {returns.slice(-20).map((r, i) => (
                  <span
                    key={i}
                    className={cn(
                      "rounded px-1.5 py-0.5 font-mono text-xs font-medium",
                      r >= 0
                        ? "bg-green-600 text-white dark:bg-green-700"
                        : "bg-red-600 text-white dark:bg-red-700"
                    )}
                  >
                    {(r * 100).toFixed(1)}%
                  </span>
                ))}
                {returns.length > 20 && (
                  <span className="text-xs text-muted-foreground">
                    {t("step1ShowingLastN", { count: returns.length })}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </StepCard>

      <StepCard stepNumber={2} title={t("step2Title")}>
        <p className="mb-3 text-sm text-muted-foreground">
          {t("step2Body")}
        </p>

        <div className="grid gap-3 md:grid-cols-2">
          <FormulaBlock
            formula="μ_anual = μ_diario × 252"
            description={t("step2FormulaDescAnnualReturn")}
          />
          <FormulaBlock
            formula="σ_anual = σ_diario × √252"
            description={t("step2FormulaDescAnnualVol")}
          />
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-2 py-2 text-left font-medium">{t("tableAsset")}</th>
                <th className="px-2 py-2 text-right font-medium">{t("tableDailyReturn")}</th>
                <th className="px-2 py-2 text-right font-medium">{t("tableDailyVol")}</th>
                <th className="px-2 py-2 text-right font-medium">{t("tableAnnualReturn")}</th>
                <th className="px-2 py-2 text-right font-medium">{t("tableAnnualVol")}</th>
              </tr>
            </thead>
            <tbody>
              {calculationSteps.tickerStats.map((stat) => (
                <tr key={stat.ticker} className="border-b border-border/50">
                  <td className="px-2 py-2 font-medium">{stat.ticker}</td>
                  <td className="px-2 py-2 text-right font-mono text-xs">
                    {(stat.meanDailyReturn * 100).toFixed(4)}%
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-xs">
                    {(stat.dailyVolatility * 100).toFixed(4)}%
                  </td>
                  <td
                    className={cn(
                      "px-2 py-2 text-right font-mono text-xs font-semibold",
                      stat.annualizedReturn >= 0 ? "text-green-600" : "text-red-600"
                    )}
                  >
                    {(stat.annualizedReturn * 100).toFixed(2)}%
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-xs font-semibold">
                    {(stat.annualizedVolatility * 100).toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </StepCard>

      <StepCard stepNumber={3} title={t("step3Title")}>
        <p className="mb-3 text-sm text-muted-foreground">
          {t("step3Body")}
        </p>

        <FormulaBlock
          formula="ρ(A,B) = Cov(A,B) / (σ_A × σ_B)"
          description={t("step3FormulaDesc")}
        />

        <div className="mt-4 space-y-2">
          {calculationSteps.pairwiseCorrelations.map(({ ticker1, ticker2, correlation }) => (
            <div
              key={`${ticker1}-${ticker2}`}
              className="flex items-center justify-between rounded border border-border/50 p-2"
            >
              <span className="font-medium">
                {ticker1} ↔ {ticker2}
              </span>
              <div className="flex items-center gap-2">
                <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                  <div
                    className={cn(
                      "h-full transition-all",
                      correlation >= 0.7
                        ? "bg-green-500"
                        : correlation >= 0.3
                          ? "bg-green-300"
                          : correlation <= -0.3
                            ? "bg-red-300"
                            : correlation <= -0.7
                              ? "bg-red-500"
                              : "bg-gray-400"
                    )}
                    style={{ width: `${Math.abs(correlation) * 100}%` }}
                  />
                </div>
                <span
                  className={cn(
                    "w-16 text-right font-mono text-sm font-semibold",
                    correlation >= 0.7
                      ? "text-green-600"
                      : correlation <= -0.3
                        ? "text-red-600"
                        : "text-muted-foreground"
                  )}
                >
                  {correlation.toFixed(3)}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded bg-muted/30 p-3 text-xs text-muted-foreground">
          <strong>{t("interpretationLabel")}</strong>
          <ul className="mt-1 list-inside list-disc space-y-1">
            <li>
              <span className="text-green-600">{t("interpretationHighPositive")}</span>{t("interpretationHighPositiveText")}
            </li>
            <li>
              <span className="text-red-600">{t("interpretationNegative")}</span>{t("interpretationNegativeText")}
            </li>
            <li>
              <span className="text-gray-600">{t("interpretationLow")}</span>{t("interpretationLowText")}
            </li>
          </ul>
        </div>
      </StepCard>

      <StepCard stepNumber={4} title={t("step4Title")}>
        <p className="mb-3 text-sm text-muted-foreground">
          {t("step4Body")}
        </p>

        <MatrixTable
          title=""
          labels={tickers}
          matrix={correlationMatrix}
          formatValue={(v) => v.toFixed(3)}
          colorScale
          isCorrelation
        />
      </StepCard>

      <StepCard stepNumber={5} title={t("step5Title")}>
        <p className="mb-3 text-sm text-muted-foreground">
          {t("step5Body")}
        </p>

        <FormulaBlock
          formula="Cov(A,B) = σ_A × σ_B × ρ(A,B)"
          description={t("step5FormulaDesc")}
        />

        <div className="mt-4">
          <MatrixTable
            title=""
            labels={tickers}
            matrix={covarianceMatrix}
            formatValue={(v) => (v * 100).toFixed(4)}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {t("step5Note")}
          </p>
        </div>
      </StepCard>

      <StepCard stepNumber={6} title={t("step6Title")}>
        <p className="mb-3 text-sm text-muted-foreground">
          {t("step6Body")}
        </p>

        <FormulaBlock
          formula="σ²_portfolio = Σᵢ Σⱼ wᵢ × wⱼ × Cov(i,j)"
          description={t("step6FormulaDesc")}
        />

        <div className="mt-4 rounded bg-green-600 p-3 dark:bg-green-700">
          <p className="text-sm text-white">
            <strong>{t("diversificationBenefitLabel")}</strong>{t("diversificationBenefitText")}
          </p>
        </div>
      </StepCard>
    </div>
  );
}
