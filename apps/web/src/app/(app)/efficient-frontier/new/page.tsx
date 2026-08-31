"use client";

import { Suspense, useState, useMemo, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useOptimization } from "@/hooks/useOptimization";
import { useSaveSimulation } from "@/hooks/useSimulations";
import { useRiskFreeRates } from "@/hooks/useRiskFreeRates";
import { formatChartDate } from "@/components/charts/chart-theme";
import {
  ApiError,
  OptimizationStrategy,
  OPTIMIZATION_STRATEGIES,
  RISK_FREE_INSTRUMENT_IDS,
  RiskFreeSource,
  SimulationParams,
} from "@/lib/api";
import Link from "next/link";
import { DateRangePicker } from "@/components/forms/DateRangePicker";
import { AssetAllocationForm, AssetRow } from "@/components/forms/AssetAllocationForm";
import { ConstraintsPanel } from "@/components/forms/ConstraintsPanel";
import * as Popover from "@radix-ui/react-popover";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { LessonButton } from "@/components/academia/LessonButton";
import { authClient } from "@/lib/auth-client";
import { SignInPrompt } from "@/components/auth/SignInPrompt";
import { decodeFormState, encodeFormState } from "@/lib/optimization-url";
import { toWeightBounds, validateAssetLimits } from "@/lib/asset-limits";

const currentYear = new Date().getFullYear();

// 0.0525 -> "5.25", without the float noise of a plain multiplication.
function percentFromRate(rate: number): string {
  return String(Number((rate * 100).toFixed(6)));
}

function NewOptimizationForm() {
  const t = useTranslations("NewOptimization");
  const tCommon = useTranslations("Common");
  const tBilling = useTranslations("Billing");
  const tInstruments = useTranslations("RiskFreeInstruments");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const isSignedIn = !!session?.user;

  // Restore the full form from URL query params on mount, so navigating back
  // from the results page (or opening a shared link) rehydrates every field.
  const [initialState] = useState(() =>
    decodeFormState(new URLSearchParams(searchParams.toString()), currentYear)
  );

  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showFrontier, setShowFrontier] = useState(initialState.showFrontier);
  const [assetConstraints, setAssetConstraints] = useState(initialState.assetConstraints);
  const [wMax, setWMax] = useState(initialState.wMax);
  const [assetLimits, setAssetLimits] = useState(initialState.assetLimits);
  const [enforceFullInvestment, setEnforceFullInvestment] = useState(initialState.enforceFullInvestment);
  const [allowShortSelling, setAllowShortSelling] = useState(initialState.allowShortSelling);
  const [useLeverage, setUseLeverage] = useState(initialState.useLeverage);
  const [maxLeverage, setMaxLeverage] = useState(initialState.maxLeverage);
  const [strategy, setStrategy] = useState<OptimizationStrategy>(initialState.strategy);
  const [targetReturn, setTargetReturn] = useState(initialState.targetReturn);
  const [targetRisk, setTargetRisk] = useState(initialState.targetRisk);
  const [riskFreeRate, setRiskFreeRate] = useState(initialState.riskFreeRate);
  // The rate is stored as a decimal but typed as a percentage, so the raw text
  // lives alongside it to keep intermediate states ("", "5.") editable.
  const [riskFreeRateInput, setRiskFreeRateInput] = useState(() =>
    percentFromRate(initialState.riskFreeRate)
  );
  const [riskFreeSource, setRiskFreeSource] = useState<RiskFreeSource>(
    initialState.riskFreeSource
  );
  const [dateRange, setDateRange] = useState(initialState.dateRange);
  const [assets, setAssets] = useState<AssetRow[]>(initialState.assets);

  const saveSimulation = useSaveSimulation();
  const hasSavedRef = useRef(false);

  const {
    data: riskFreeRates,
    isPending: isRiskFreeRatesPending,
    isError: isRiskFreeRatesError,
  } = useRiskFreeRates();

  const selectedRiskFreeInstrument = useMemo(
    () => riskFreeRates?.find((rate) => rate.id === riskFreeSource) ?? null,
    [riskFreeRates, riskFreeSource]
  );

  // A preset names an instrument, not a frozen number, so the field follows
  // that instrument's current quote once the live yields arrive — on mount, and
  // again when a shared link restores a preset. Typing a rate switches the
  // source to manual, which clears the selection and stops this from fighting
  // the user's own input.
  useEffect(() => {
    if (!selectedRiskFreeInstrument) return;
    setRiskFreeRate(selectedRiskFreeInstrument.rate);
    setRiskFreeRateInput(percentFromRate(selectedRiskFreeInstrument.rate));
  }, [selectedRiskFreeInstrument]);

  // Mirror every form field into the URL query string. Using
  // history.replaceState (which Next.js syncs with its router) keeps the
  // current history entry up to date without a scroll jump or server roundtrip,
  // so the entry we leave behind when navigating to the results page already
  // carries the full form state for back/forward restoration.
  const queryString = useMemo(
    () =>
      encodeFormState(
        {
          assets,
          dateRange,
          strategy,
          targetReturn,
          targetRisk,
          riskFreeRate,
          riskFreeSource,
          enforceFullInvestment,
          allowShortSelling,
          useLeverage,
          maxLeverage,
          assetConstraints,
          wMax,
          assetLimits,
          showFrontier,
        },
        currentYear
      ).toString(),
    [assets, dateRange, strategy, targetReturn, targetRisk, riskFreeRate, riskFreeSource, enforceFullInvestment, allowShortSelling, useLeverage, maxLeverage, assetConstraints, wMax, assetLimits, showFrontier]
  );

  useEffect(() => {
    if (isSubmitted) return;
    const url = queryString
      ? `${window.location.pathname}?${queryString}`
      : window.location.pathname;
    window.history.replaceState(window.history.state, "", url);
  }, [queryString, isSubmitted]);

  const currentSimulationParams = useMemo((): SimulationParams => ({
    tickers: assets.map((a) => a.ticker).filter(Boolean),
    assets: assets
      .filter((a) => a.ticker)
      .map((a) => ({
        ticker: a.ticker,
        allocation: a.allocation,
        minWeight: a.minWeight,
        maxWeight: a.maxWeight,
      })),
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
    assetLimits,
    showFrontier,
  }), [assets, dateRange, strategy, targetReturn, targetRisk, riskFreeRate, enforceFullInvestment, allowShortSelling, useLeverage, maxLeverage, assetConstraints, wMax, assetLimits, showFrontier]);

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

  // The optimizer allocates `maxLeverage` of capital, so that — not a flat
  // 100% — is what the per-asset floors and caps have to bracket.
  const targetPercent = (useLeverage ? maxLeverage : 1) * 100;

  const limitsError = useMemo(
    () =>
      validateAssetLimits(currentSimulationParams.assets, {
        assetLimits,
        targetPercent,
        enforceFullInvestment,
        fallbackMaxPercent: assetConstraints ? wMax * 100 : 100,
      }),
    [
      currentSimulationParams.assets,
      assetLimits,
      targetPercent,
      enforceFullInvestment,
      assetConstraints,
      wMax,
    ]
  );

  const limitsErrorMessage = useMemo(() => {
    if (!limitsError) return null;
    switch (limitsError.kind) {
      case "minAboveMax":
        return t("limitsMinAboveMax", { ticker: limitsError.ticker });
      case "outOfRange":
        return t("limitsOutOfRange", { ticker: limitsError.ticker });
      case "minTotalTooHigh":
        return t("limitsMinTotalTooHigh", {
          total: limitsError.total.toFixed(1),
          target: limitsError.target.toFixed(0),
        });
      case "maxTotalTooLow":
        return t("limitsMaxTotalTooLow", {
          total: limitsError.total.toFixed(1),
          target: limitsError.target.toFixed(0),
        });
    }
  }, [limitsError, t]);

  const weightBounds = useMemo(
    () => toWeightBounds(currentSimulationParams.assets, assetLimits),
    [currentSimulationParams.assets, assetLimits]
  );

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
      wMinPerAsset: weightBounds?.wMinPerAsset,
      wMaxPerAsset: weightBounds?.wMaxPerAsset,
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

  const canProceed = selectedTickers.length >= 2 && isAllocationValid && !limitsError;

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
    const isInsufficientCredits =
      optimizationError instanceof ApiError && optimizationError.isInsufficientCredits();

    if (isInsufficientCredits) {
      return (
        <div className="mx-auto max-w-md space-y-4 pt-16 text-center">
          <h2 className="font-display text-xl">{tBilling("outOfCreditsTitle")}</h2>
          <p className="text-muted-foreground">{tBilling("outOfCreditsBody")}</p>
          <div className="flex justify-center gap-3">
            <Link
              href="/billing"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:brightness-110"
            >
              {tBilling("outOfCreditsCta")}
            </Link>
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
        </div>
      );
    }

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
                <label
                  htmlFor="risk-free-source"
                  className="mb-1 block text-xs text-muted-foreground"
                >
                  {t("riskFreeRateLabel")}
                </label>
                <select
                  id="risk-free-source"
                  value={riskFreeSource}
                  onChange={(e) => setRiskFreeSource(e.target.value as RiskFreeSource)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {RISK_FREE_INSTRUMENT_IDS.map((id) => {
                    const quoted = riskFreeRates?.find((rate) => rate.id === id);
                    return (
                      <option key={id} value={id} disabled={!quoted}>
                        {quoted
                          ? t("riskFreeInstrumentOption", {
                              name: tInstruments(id),
                              rate: percentFromRate(quoted.rate),
                            })
                          : tInstruments(id)}
                      </option>
                    );
                  })}
                  <option value="manual">{t("riskFreeSourceManual")}</option>
                </select>

                <div className="mt-2 flex items-center gap-3">
                  <div className="relative w-32">
                    <input
                      id="risk-free-rate"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={0.001}
                      aria-label={t("riskFreeRateInputAria")}
                      value={riskFreeRateInput}
                      onChange={(e) => {
                        const val = e.target.value;
                        // Typing an own rate is what "manual" means, so editing
                        // the field detaches it from the selected instrument.
                        setRiskFreeSource("manual");
                        setRiskFreeRateInput(val);
                        const parsed = Number(val);
                        setRiskFreeRate(
                          val === "" || Number.isNaN(parsed) ? 0 : Math.max(0, parsed) / 100
                        );
                      }}
                      onBlur={() => setRiskFreeRateInput(percentFromRate(riskFreeRate))}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 pr-8 text-right text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      %
                    </span>
                  </div>

                  <p className="flex-1 text-xs text-muted-foreground">
                    {selectedRiskFreeInstrument
                      ? t("riskFreeRateQuoteNote", {
                          ticker: selectedRiskFreeInstrument.ticker,
                          date: formatChartDate(selectedRiskFreeInstrument.asOf),
                        })
                      : isRiskFreeRatesPending
                        ? t("riskFreeRatesLoading")
                        : isRiskFreeRatesError || !riskFreeRates?.length
                          ? t("riskFreeRatesUnavailable")
                          : t("riskFreeRateManualNote")}
                  </p>
                </div>
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

        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border pb-4 dark:border-border/50">
          <input
            type="checkbox"
            id="assetLimits"
            checked={assetLimits}
            onChange={(e) => setAssetLimits(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          <label htmlFor="assetLimits" className="text-sm">
            {t("assetLimitsLabel")}
          </label>
          <Popover.Root>
            <Popover.Trigger asChild>
              <button
                type="button"
                className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={t("assetLimitsInfoAria")}
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                className="z-50 w-[calc(100vw-2rem)] max-w-xs rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-lg sm:w-80"
                sideOffset={5}
                align="start"
              >
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">{t("assetLimitsInfoTitle")}</h4>
                  <p className="text-xs text-muted-foreground">
                    {t("assetLimitsInfoIntro")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <strong>{t("assetLimitsInfoEmptyLabel")}</strong>{" "}
                    {t("assetLimitsInfoEmpty")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <strong>{t("assetLimitsInfoFeasibleLabel")}</strong>{" "}
                    {t("assetLimitsInfoFeasible")}
                  </p>
                </div>
                <Popover.Arrow className="fill-border" />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          <p className="w-full text-xs text-muted-foreground">
            {t("assetLimitsHelp")}
          </p>
        </div>

        <AssetAllocationForm
          assets={assets}
          onChange={setAssets}
          showLimits={assetLimits}
          limitsError={limitsErrorMessage}
        />
      </div>

      {/* Submit */}
      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
        {!canProceed && (
          <p className="text-sm text-muted-foreground sm:mr-4">
            {selectedTickers.length < 2
              ? t("needAtLeastTwo")
              : limitsErrorMessage
              ? limitsErrorMessage
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

export default function NewOptimizationPage() {
  // useSearchParams (read in NewOptimizationForm) requires a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <NewOptimizationForm />
    </Suspense>
  );
}
