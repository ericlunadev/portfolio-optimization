"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useOptimization } from "@/hooks/useOptimization";
import { useSaveSimulation } from "@/hooks/useSimulations";
import { OptimizationStrategy, OPTIMIZATION_STRATEGIES, SimulationParams } from "@/lib/api";
import { DateRangePicker, DateRange } from "@/components/forms/DateRangePicker";
import { AssetAllocationForm, AssetRow } from "@/components/forms/AssetAllocationForm";
import { ConstraintsPanel } from "@/components/forms/ConstraintsPanel";
import * as Popover from "@radix-ui/react-popover";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { LessonButton } from "@/components/academia/LessonButton";
import { authClient } from "@/lib/auth-client";
import { SignInPrompt } from "@/components/auth/SignInPrompt";

function generateId() {
  return Math.random().toString(36).slice(2, 9);
}

const currentYear = new Date().getFullYear();

const INITIAL_ASSETS: AssetRow[] = Array.from({ length: 2 }, () => ({
  id: generateId(),
  ticker: "",
  allocation: null,
}));

export default function NewOptimizationPage() {
  const t = useTranslations("NewOptimization");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const isSignedIn = !!session?.user;
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showFrontier, setShowFrontier] = useState(true);
  const [assetConstraints, setAssetConstraints] = useState(false);
  const [wMax, setWMax] = useState(0.4);
  const [enforceFullInvestment, setEnforceFullInvestment] = useState(true);
  const [allowShortSelling, setAllowShortSelling] = useState(false);
  const [useLeverage, setUseLeverage] = useState(false);
  const [maxLeverage, setMaxLeverage] = useState(1.5);
  const [strategy, setStrategy] = useState<OptimizationStrategy>("max-sharpe");
  const [targetReturn, setTargetReturn] = useState(0.10);
  const [targetRisk, setTargetRisk] = useState(0.15);
  const [riskFreeRate, setRiskFreeRate] = useState(0.05);
  const [dateRange, setDateRange] = useState<DateRange>({
    startMonth: 1,
    startYear: currentYear - 5,
    endMonth: 12,
    endYear: currentYear,
  });
  const [assets, setAssets] = useState<AssetRow[]>(INITIAL_ASSETS);

  const saveSimulation = useSaveSimulation();
  const hasSavedRef = useRef(false);

  const currentSimulationParams = useMemo((): SimulationParams => ({
    tickers: assets.map((a) => a.ticker).filter(Boolean),
    assets: assets.filter((a) => a.ticker).map((a) => ({ ticker: a.ticker, allocation: a.allocation })),
    dateRange,
    strategy,
    targetReturn: strategy === "target-return" ? targetReturn : undefined,
    targetRisk: strategy === "target-risk" ? targetRisk : undefined,
    riskFreeRate,
    enforceFullInvestment,
    allowShortSelling,
    useLeverage,
    maxLeverage,
    assetConstraints,
    wMax,
    showFrontier,
  }), [assets, dateRange, strategy, targetReturn, targetRisk, riskFreeRate, enforceFullInvestment, allowShortSelling, useLeverage, maxLeverage, assetConstraints, wMax, showFrontier]);

  const selectedTickers = useMemo(
    () => assets.map((a) => a.ticker).filter(Boolean),
    [assets]
  );

  const totalAllocation = useMemo(() => {
    return assets.reduce((sum, a) => sum + (a.allocation ?? 0), 0);
  }, [assets]);

  const hasAnyAllocation = useMemo(() => {
    return assets.some((a) => a.allocation !== null && a.allocation > 0);
  }, [assets]);

  const isAllocationValid = !hasAnyAllocation || Math.abs(totalAllocation - 100) < 0.01;

  const startDate = useMemo(() => {
    const month = String(dateRange.startMonth).padStart(2, "0");
    return `${dateRange.startYear}-${month}-01`;
  }, [dateRange.startMonth, dateRange.startYear]);

  const endDate = useMemo(() => {
    const month = String(dateRange.endMonth).padStart(2, "0");
    const lastDay = new Date(dateRange.endYear, dateRange.endMonth, 0).getDate();
    return `${dateRange.endYear}-${month}-${String(lastDay).padStart(2, "0")}`;
  }, [dateRange.endMonth, dateRange.endYear]);

  const tStrategies = useTranslations("Strategies");
  const currentStrategy = OPTIMIZATION_STRATEGIES.find((s) => s.value === strategy);

  const {
    data: optimizationResult,
    isLoading: loadingOptimization,
    error: optimizationError,
  } = useOptimization(
    isSubmitted ? selectedTickers : [],
    strategy,
    {
      wMax: assetConstraints ? wMax : 1,
      riskFreeRate: strategy === "max-sharpe" ? riskFreeRate : 0,
      targetReturn: strategy === "target-return" ? targetReturn : undefined,
      targetRisk: strategy === "target-risk" ? targetRisk : undefined,
      startDate,
      endDate,
      enforceFullInvestment,
      allowShortSelling,
      maxLeverage: useLeverage ? maxLeverage : 1.0,
    }
  );

  useEffect(() => {
    if (isSubmitted && optimizationResult && !hasSavedRef.current) {
      hasSavedRef.current = true;
      saveSimulation.mutate(
        { params: currentSimulationParams, result: optimizationResult },
        {
          onSuccess: (saved) => {
            router.push(`/efficient-frontier/${saved.id}`);
          },
          onError: () => {
            hasSavedRef.current = false;
          },
        }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSubmitted, optimizationResult]);

  const canProceed = selectedTickers.length >= 2 && isAllocationValid;

  if (isSessionPending) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">{tCommon("loading")}</div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <SignInPrompt
        title={t("signInTitle")}
        description={t("signInDescription")}
      />
    );
  }

  if (isSubmitted) {
    const errorMessage = optimizationError
      ? t("errorOptimize")
      : saveSimulation.isError
      ? t("errorSave")
      : null;

    if (errorMessage) {
      return (
        <div className="mx-auto max-w-md space-y-4 pt-16 text-center">
          <p className="text-destructive">{errorMessage}</p>
          <button
            onClick={() => {
              hasSavedRef.current = false;
              saveSimulation.reset();
              setIsSubmitted(false);
            }}
            className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            {t("backToConfig")}
          </button>
        </div>
      );
    }

    const loadingLabel = loadingOptimization || !optimizationResult
      ? t("loadingOptimize")
      : t("loadingSave");

    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        <div className="text-sm text-muted-foreground">{loadingLabel}</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 md:space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl md:text-3xl tracking-tight">{t("title")}</h1>
        <LessonButton
          station="portfolio"
          label={t("lessonPortfolio")}
        />
      </div>

      {/* Date Range & Parameters */}
      <div className="glass-card p-4 md:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg">{t("parameters")}</h2>
          <LessonButton
            station="allocation"
            variant="inline"
            label={t("lessonAllocation")}
          />
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {/* Date Range */}
          <div>
            <div className="mb-2 flex items-center gap-1.5">
              <label className="block text-sm font-medium">
                {t("dateRangeLabel")}
              </label>
              <Popover.Root>
                <Popover.Trigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    aria-label={t("dateRangeInfoAria")}
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    className="z-50 w-[calc(100vw-2rem)] max-w-xs sm:w-80 rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-lg"
                    sideOffset={5}
                    align="start"
                  >
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold">{t("dateRangeInfoTitle")}</h4>
                      <p className="text-xs text-muted-foreground">
                        {t("dateRangeInfoIntro")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <strong>{t("dateRangeInfoStartLabel")}</strong> {t("dateRangeInfoStart")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <strong>{t("dateRangeInfoEndLabel")}</strong> {t("dateRangeInfoEnd")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <strong>{t("dateRangeInfoTipLabel")}</strong> {t("dateRangeInfoTip")}
                      </p>
                    </div>
                    <Popover.Arrow className="fill-border" />
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            </div>
            <DateRangePicker value={dateRange} onChange={setDateRange} />
          </div>

          {/* Optimization Strategy */}
          <div>
            <div className="mb-2 flex items-center gap-1.5">
              <label className="block text-sm font-medium">
                {t("strategyLabel")}
              </label>
              <Popover.Root>
                <Popover.Trigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    aria-label={t("strategyInfoAria")}
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    className="z-50 w-[calc(100vw-2rem)] max-w-xs sm:w-80 rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-lg"
                    sideOffset={5}
                    align="start"
                  >
                    <div className="space-y-3">
                      <p className="text-sm font-medium">
                        {t("strategyInfoTitle")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("strategyInfoIntro")}
                      </p>
                      <ul className="space-y-2 text-xs">
                        <li>
                          <span className="font-medium">{t("strategyMaxSharpeLabel")}</span>{" "}
                          <span className="text-muted-foreground">
                            {t("strategyMaxSharpeText")}
                          </span>
                        </li>
                        <li>
                          <span className="font-medium">{t("strategyMinRiskLabel")}</span>{" "}
                          <span className="text-muted-foreground">
                            {t("strategyMinRiskText")}
                          </span>
                        </li>
                        <li>
                          <span className="font-medium">{t("strategyMaxReturnLabel")}</span>{" "}
                          <span className="text-muted-foreground">
                            {t("strategyMaxReturnText")}
                          </span>
                        </li>
                        <li>
                          <span className="font-medium">{t("strategyTargetReturnLabel")}</span>{" "}
                          <span className="text-muted-foreground">
                            {t("strategyTargetReturnText")}
                          </span>
                        </li>
                        <li>
                          <span className="font-medium">{t("strategyTargetRiskLabel")}</span>{" "}
                          <span className="text-muted-foreground">
                            {t("strategyTargetRiskText")}
                          </span>
                        </li>
                        <li>
                          <span className="font-medium">{t("strategyInflectionLabel")}</span>{" "}
                          <span className="text-muted-foreground">
                            {t("strategyInflectionText")}
                          </span>
                        </li>
                      </ul>
                    </div>
                    <Popover.Arrow className="fill-border" />
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            </div>
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as OptimizationStrategy)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {OPTIMIZATION_STRATEGIES.map((s) => (
                <option key={s.value} value={s.value}>
                  {tStrategies(`${s.value}.label`)}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              {currentStrategy ? tStrategies(`${currentStrategy.value}.description`) : null}
            </p>

            {strategy === "target-return" && (
              <div className="mt-3">
                <label className="mb-1 block text-xs text-muted-foreground">
                  {t("targetReturnSlider", { value: (targetReturn * 100).toFixed(1) })}
                </label>
                <input
                  type="range"
                  min={0}
                  max={0.5}
                  step={0.01}
                  value={targetReturn}
                  onChange={(e) => setTargetReturn(Number(e.target.value))}
                  className="w-full"
                />
              </div>
            )}

            {strategy === "target-risk" && (
              <div className="mt-3">
                <div className="mb-1 flex items-center gap-1">
                  <label className="text-xs text-muted-foreground">
                    {t("targetRiskSlider", { value: (targetRisk * 100).toFixed(1) })}
                  </label>
                  <Popover.Root>
                    <Popover.Trigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                        aria-label={t("targetRiskInfoAria")}
                      >
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </Popover.Trigger>
                    <Popover.Portal>
                      <Popover.Content
                        className="z-50 w-[calc(100vw-2rem)] max-w-xs sm:w-80 rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-md"
                        sideOffset={5}
                        align="start"
                      >
                        <div className="space-y-2">
                          <h4 className="text-sm font-semibold">{t("targetRiskInfoTitle")}</h4>
                          <p className="text-xs text-muted-foreground">
                            {t("targetRiskInfoIntro")}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            <strong>{t("targetRiskInfoHowLabel")}</strong> {t("targetRiskInfoHow")}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            <strong>{t("targetRiskInfoFeasLabel")}</strong> {t("targetRiskInfoFeas")}
                          </p>
                        </div>
                        <Popover.Arrow className="fill-border" />
                      </Popover.Content>
                    </Popover.Portal>
                  </Popover.Root>
                </div>
                <input
                  type="range"
                  min={0.01}
                  max={0.5}
                  step={0.01}
                  value={targetRisk}
                  onChange={(e) => setTargetRisk(Number(e.target.value))}
                  className="w-full"
                />
              </div>
            )}

            {strategy === "max-sharpe" && (
              <div className="mt-3">
                <label className="mb-1 block text-xs text-muted-foreground">
                  {t("riskFreeRateSlider", { value: (riskFreeRate * 100).toFixed(3) })}
                </label>
                <input
                  type="range"
                  min={0}
                  max={0.10}
                  step={0.00001}
                  value={riskFreeRate}
                  onChange={(e) => setRiskFreeRate(Number(e.target.value))}
                  className="w-full"
                />
              </div>
            )}
          </div>

          {/* Asset Constraints */}
          <div>
            <div className="mb-2 flex items-center gap-1.5">
              <label className="block text-sm font-medium">
                {t("assetConstraintsLabel")}
              </label>
              <Popover.Root>
                <Popover.Trigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    aria-label={t("assetConstraintsInfoAria")}
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    className="z-50 w-[calc(100vw-2rem)] max-w-xs sm:w-80 rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-lg"
                    sideOffset={5}
                    align="start"
                  >
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold">{t("assetConstraintsInfoTitle")}</h4>
                      <p className="text-xs text-muted-foreground">
                        {t("assetConstraintsInfoIntro")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <strong>{t("assetConstraintsInfoNoneLabel")}</strong> {t("assetConstraintsInfoNone")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <strong>{t("assetConstraintsInfoWithLabel")}</strong> {t("assetConstraintsInfoWith")}
                      </p>
                    </div>
                    <Popover.Arrow className="fill-border" />
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            </div>
            <select
              value={assetConstraints ? "yes" : "no"}
              onChange={(e) => setAssetConstraints(e.target.value === "yes")}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="no">{tCommon("no")}</option>
              <option value="yes">{tCommon("yes")}</option>
            </select>
            {assetConstraints && (
              <div className="mt-2">
                <div className="mb-1 flex items-center gap-1">
                  <label className="text-xs text-muted-foreground">
                    {t("wMaxSlider", { value: Math.round(wMax * 100) })}
                  </label>
                  <Popover.Root>
                    <Popover.Trigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                        aria-label={t("wMaxInfoAria")}
                      >
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </Popover.Trigger>
                    <Popover.Portal>
                      <Popover.Content
                        className="z-50 w-[calc(100vw-2rem)] max-w-xs sm:w-80 rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-md"
                        sideOffset={5}
                        align="start"
                      >
                        <div className="space-y-2">
                          <h4 className="text-sm font-semibold">{t("wMaxInfoTitle")}</h4>
                          <p className="text-xs text-muted-foreground">
                            {t("wMaxInfoIntro")}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            <strong>{t("wMaxInfoWhyLabel")}</strong> {t("wMaxInfoWhy")}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            <strong>{t("wMaxInfoEffectLabel")}</strong> {t("wMaxInfoEffect")}
                          </p>
                        </div>
                        <Popover.Arrow className="fill-border" />
                      </Popover.Content>
                    </Popover.Portal>
                  </Popover.Root>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={wMax}
                  onChange={(e) => setWMax(Number(e.target.value))}
                  className="w-full"
                />
              </div>
            )}
          </div>

          {/* Show Frontier */}
          <div className="flex items-center gap-2 self-end">
            <input
              type="checkbox"
              id="showFrontier"
              checked={showFrontier}
              onChange={(e) => setShowFrontier(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <label htmlFor="showFrontier" className="text-sm">
              {t("showFrontier")}
            </label>
          </div>
        </div>
      </div>

      {/* Portfolio Constraints */}
      <div className="glass-card p-4 md:p-6">
        <h2 className="mb-4 font-display text-lg">{t("portfolioConstraints")}</h2>
        <ConstraintsPanel
          enforceFullInvestment={enforceFullInvestment}
          onEnforceFullInvestmentChange={setEnforceFullInvestment}
          allowShortSelling={allowShortSelling}
          onAllowShortSellingChange={setAllowShortSelling}
          useLeverage={useLeverage}
          onUseLeverageChange={setUseLeverage}
          maxLeverage={maxLeverage}
          onMaxLeverageChange={setMaxLeverage}
        />
      </div>

      {/* Asset Allocation */}
      <div className="glass-card p-4 md:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg">{t("assets")}</h2>
          <LessonButton
            station="assets"
            variant="inline"
            label={t("lessonAssets")}
          />
        </div>
        <AssetAllocationForm assets={assets} onChange={setAssets} />
      </div>

      {/* Submit */}
      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
        {!canProceed && (
          <p className="text-sm text-muted-foreground sm:mr-4">
            {selectedTickers.length < 2
              ? t("needAtLeastTwo")
              : t("allocationMustSumTo100", { value: totalAllocation.toFixed(1) })}
          </p>
        )}
        <button
          onClick={() => setIsSubmitted(true)}
          disabled={!canProceed}
          className={cn(
            "rounded-lg px-6 py-3 text-sm font-semibold transition-all",
            canProceed
              ? "bg-primary text-primary-foreground hover:brightness-110 glow-gold"
              : "cursor-not-allowed bg-muted text-muted-foreground"
          )}
        >
          {t("submit")}
        </button>
      </div>
    </div>
  );
}
