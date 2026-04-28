"use client";

import { useMemo, useState } from "react";
import {
  useEfficientFrontierTickers,
  useNegReturnProbability,
  usePortfolioCumulativeReturnsTickers,
  useRollingVolatilityTickers,
} from "@/hooks/useOptimization";
import {
  OPTIMIZATION_STRATEGIES,
  OptimizationResultWithStrategy,
  SimulationParams,
} from "@/lib/api";
import { SimulationParamsSummary } from "@/components/SimulationParamsSummary";
import { RiskReturnScatterChart } from "@/components/charts/ScatterChart";
import { PortfolioWeightsChart } from "@/components/charts/PortfolioWeightsChart";
import { CumulativeReturnsChart } from "@/components/charts/CumulativeReturnsChart";
import { ProbNegReturnChart } from "@/components/charts/ProbNegReturnChart";
import { AssetVolatilityChart } from "@/components/charts/AssetVolatilityChart";
import { RollingVolatilityChart } from "@/components/charts/RollingVolatilityChart";
import { ChartReveal } from "@/components/charts/ChartReveal";
import { StatCard, StatCardGrid } from "@/components/charts/StatCards";
import { CalculationSteps } from "@/components/debug/CalculationSteps";
import { cn, formatPercent } from "@/lib/utils";
import * as Tabs from "@radix-ui/react-tabs";
import { useTranslations } from "next-intl";
import { TrendingUp, Activity, Sparkles, ShieldAlert } from "lucide-react";

interface MarkowitzResultsProps {
  params: SimulationParams;
  result: OptimizationResultWithStrategy;
}

export function MarkowitzResults({ params, result }: MarkowitzResultsProps) {
  const tStrategies = useTranslations("Strategies");
  const t = useTranslations("MarkowitzResults");
  const [debugTangentSlope, setDebugTangentSlope] = useState(false);

  const selectedTickers = params.tickers;
  const currentStrategy = OPTIMIZATION_STRATEGIES.find(
    (s) => s.value === params.strategy
  );
  const strategyLabel = currentStrategy
    ? tStrategies(`${currentStrategy.value}.label`)
    : t("fallbackStrategy");

  const startDate = useMemo(() => {
    const month = String(params.dateRange.startMonth).padStart(2, "0");
    return `${params.dateRange.startYear}-${month}-01`;
  }, [params.dateRange.startMonth, params.dateRange.startYear]);

  const endDate = useMemo(() => {
    const month = String(params.dateRange.endMonth).padStart(2, "0");
    const lastDay = new Date(
      params.dateRange.endYear,
      params.dateRange.endMonth,
      0
    ).getDate();
    return `${params.dateRange.endYear}-${month}-${String(lastDay).padStart(2, "0")}`;
  }, [params.dateRange.endMonth, params.dateRange.endYear]);

  const hasAnyAllocation = useMemo(
    () =>
      params.assets.some((a) => a.allocation !== null && a.allocation > 0),
    [params.assets]
  );

  const totalAllocation = useMemo(
    () => params.assets.reduce((sum, a) => sum + (a.allocation ?? 0), 0),
    [params.assets]
  );

  const isAllocationValid =
    !hasAnyAllocation || Math.abs(totalAllocation - 100) < 0.01;

  const userWeights = useMemo(() => {
    if (!hasAnyAllocation || !isAllocationValid) return [];
    return params.assets
      .filter((a) => a.ticker)
      .map((a) => (a.allocation ?? 0) / 100);
  }, [params.assets, hasAnyAllocation, isAllocationValid]);

  const optimalWeights = useMemo(
    () => result.weights.map((w) => w.weight),
    [result.weights]
  );

  const { data: frontierData } = useEfficientFrontierTickers(
    params.showFrontier ? selectedTickers : [],
    startDate,
    endDate,
    params.enforceFullInvestment,
    params.allowShortSelling,
    params.useLeverage ? params.maxLeverage : 1.0,
    params.assetConstraints ? params.wMax : 1.0
  );

  const { data: cumulativeData } = usePortfolioCumulativeReturnsTickers(
    selectedTickers,
    optimalWeights,
    undefined
  );

  const { data: negReturnData } = useNegReturnProbability(
    result.expected_return,
    result.volatility,
    36
  );

  const { data: rollingVolData } = useRollingVolatilityTickers(
    selectedTickers,
    252,
    startDate,
    endDate
  );

  const { data: userCumulativeData } = usePortfolioCumulativeReturnsTickers(
    hasAnyAllocation && isAllocationValid ? selectedTickers : [],
    userWeights,
    undefined
  );

  const userPortfolioStats = useMemo(() => {
    if (
      !hasAnyAllocation ||
      !isAllocationValid ||
      userWeights.length === 0
    ) {
      return null;
    }
    const expRet = result.weights.reduce(
      (sum, w, i) => sum + w.exp_ret * (userWeights[i] ?? 0),
      0
    );
    const approxVol = result.weights.reduce(
      (sum, w, i) => sum + w.volatility * (userWeights[i] ?? 0),
      0
    );
    return { expectedReturn: expRet, volatility: approxVol };
  }, [result, hasAnyAllocation, isAllocationValid, userWeights]);

  const scatterData = useMemo(
    () =>
      result.weights.map((w) => ({
        name: w.fund_name,
        vol: w.volatility,
        ret: w.exp_ret,
        weight: w.weight,
      })),
    [result.weights]
  );

  const optimizedPortfolioPoint = useMemo(() => {
    return {
      name: strategyLabel,
      vol: result.volatility,
      ret: result.expected_return,
    };
  }, [result, strategyLabel]);

  const userPortfolioLabel = t("userPortfolio");
  const optimalPortfolioLabel = t("optimalPortfolio");

  const userPortfolioPoint = useMemo(() => {
    if (!userPortfolioStats) return null;
    return {
      name: userPortfolioLabel,
      vol: userPortfolioStats.volatility,
      ret: userPortfolioStats.expectedReturn,
    };
  }, [userPortfolioStats, userPortfolioLabel]);

  const weightsComparisonData = useMemo(() => {
    if (!hasAnyAllocation || !isAllocationValid) return undefined;
    return result.weights.map((w, i) => ({
      name: w.fund_name,
      optimalWeight: w.weight,
      userWeight: userWeights[i] ?? 0,
    }));
  }, [result.weights, hasAnyAllocation, isAllocationValid, userWeights]);

  const frontierPoints = useMemo(
    () => frontierData?.points ?? [],
    [frontierData]
  );

  const cumRetChartData = useMemo(() => {
    // The API returns a series identified by "Portafolio Óptimo".
    // We rename it on the client to the localized label so it renders correctly.
    const PORTFOLIO_API_NAME = "Portafolio Óptimo";
    const allSeries = (cumulativeData?.series || []).map((s) =>
      s.name === PORTFOLIO_API_NAME
        ? { ...s, name: optimalPortfolioLabel }
        : s
    );

    if (userCumulativeData?.series) {
      const userPortfolioSeries = userCumulativeData.series.find(
        (s) => s.name === PORTFOLIO_API_NAME
      );
      if (userPortfolioSeries) {
        allSeries.push({
          name: userPortfolioLabel,
          data: userPortfolioSeries.data,
        });
      }
    }

    if (allSeries.length === 0) {
      return {
        data: [] as { date: string; [key: string]: string | number }[],
        series: [] as string[],
      };
    }

    const allDates = new Set<string>();
    allSeries.forEach((s) => {
      s.data.forEach((d) => allDates.add(d.date));
    });

    const sortedDates = Array.from(allDates).sort();
    const seriesNames = allSeries.map((s) => s.name);

    const data = sortedDates.map((date) => {
      const point: { date: string; [key: string]: string | number } = { date };
      allSeries.forEach((s) => {
        const dp = s.data.find((d) => d.date === date);
        if (dp) point[s.name] = dp.value;
      });
      return point;
    });

    return { data, series: seriesNames };
  }, [cumulativeData, userCumulativeData, optimalPortfolioLabel, userPortfolioLabel]);

  const assetVolatilityData = useMemo(
    () =>
      result.weights.map((w) => ({
        name: w.fund_name,
        volatility: w.volatility,
      })),
    [result.weights]
  );

  const rollingVolChartData = useMemo(() => {
    if (!rollingVolData?.series || rollingVolData.series.length === 0) {
      return {
        data: [] as { date: string; [key: string]: string | number }[],
        series: [] as string[],
      };
    }

    const allDates = new Set<string>();
    rollingVolData.series.forEach((s) => {
      s.data.forEach((d) => allDates.add(d.date));
    });

    const sortedDates = Array.from(allDates).sort();
    const seriesNames = rollingVolData.series.map((s) => s.name);

    const data = sortedDates.map((date) => {
      const point: { date: string; [key: string]: string | number } = { date };
      rollingVolData.series.forEach((s) => {
        const dp = s.data.find((d) => d.date === date);
        if (dp) point[s.name] = dp.volatility;
      });
      return point;
    });

    return { data, series: seriesNames };
  }, [rollingVolData]);

  return (
    <div className="space-y-6">
      <SimulationParamsSummary params={params} />

      <Tabs.Root defaultValue="portfolio" className="w-full">
        <Tabs.List className="mb-6 flex gap-1 overflow-x-auto rounded-xl bg-accent/50 p-1 border border-border/30">
          <Tabs.Trigger
            value="portfolio"
            className={cn(
              "whitespace-nowrap px-4 py-2 text-sm font-medium transition-all duration-200 rounded-lg sm:px-5",
              "data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm",
              "text-muted-foreground hover:text-foreground"
            )}
          >
            {strategyLabel}
          </Tabs.Trigger>
          <Tabs.Trigger
            value="data"
            className={cn(
              "whitespace-nowrap px-4 py-2 text-sm font-medium transition-all duration-200 rounded-lg sm:px-5",
              "data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm",
              "text-muted-foreground hover:text-foreground"
            )}
          >
            {t("tabData")}
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="portfolio" className="space-y-6">
          <StatCardGrid>
            <StatCard
              label={t("expectedReturn")}
              value={formatPercent(result.expected_return)}
              accent="gold"
              icon={<TrendingUp className="h-4 w-4" />}
              hint={
                <>
                  {t("ci95Label")}: {formatPercent(result.stats.ci_95_low)} —{" "}
                  {formatPercent(result.stats.ci_95_high)}
                </>
              }
            />
            <StatCard
              label={t("volatility")}
              value={formatPercent(result.volatility)}
              accent="violet"
              icon={<Activity className="h-4 w-4" />}
              hint={t("volatilityHint")}
            />
            <StatCard
              label={t("sharpeRatio")}
              value={
                result.sharpe_ratio != null
                  ? result.sharpe_ratio.toFixed(2)
                  : "N/A"
              }
              accent="emerald"
              icon={<Sparkles className="h-4 w-4" />}
              hint={t("sharpeHint")}
            />
            <StatCard
              label={t("probNeg1y")}
              value={formatPercent(result.stats.prob_neg_1y)}
              accent="rose"
              icon={<ShieldAlert className="h-4 w-4" />}
              hint={t("probNeg2yHint", {
                value: formatPercent(result.stats.prob_neg_2y),
              })}
            />
          </StatCardGrid>

          <div className="glass-card overflow-hidden p-4 md:p-5">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h3 className="font-display text-lg">{t("riskReturnTitle")}</h3>
                <p className="text-xs text-muted-foreground">
                  {t("riskReturnSubtitle")}
                </p>
              </div>
              <label className="flex shrink-0 items-center gap-2 rounded-lg border border-border/50 bg-accent/40 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
                <input
                  type="checkbox"
                  checked={debugTangentSlope}
                  onChange={(e) => setDebugTangentSlope(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-input"
                />
                {t("debug")}
              </label>
            </div>
            <ChartReveal placeholderClassName="h-[280px] sm:h-[360px] md:h-[400px]">
              <RiskReturnScatterChart
                data={scatterData}
                frontier={frontierPoints}
                frontierTickers={frontierData?.tickers}
                optimizedPortfolio={optimizedPortfolioPoint}
                userPortfolio={userPortfolioPoint}
                showTangentSlope={debugTangentSlope}
              />
            </ChartReveal>
          </div>

          <div className="grid gap-4 md:grid-cols-2 md:gap-6">
            <div className="glass-card p-4 md:p-5">
              <ChartReveal
                placeholderStyle={{
                  height:
                    48 +
                    Math.max(
                      200,
                      (weightsComparisonData?.length ?? result.weights.length) *
                        (weightsComparisonData ? 50 : 40)
                    ),
                }}
              >
                <PortfolioWeightsChart
                  data={result.weights.map((w) => ({
                    name: w.fund_name,
                    weight: w.weight,
                    ret: w.exp_ret,
                    vol: w.volatility,
                  }))}
                  comparisonData={weightsComparisonData}
                  title={
                    weightsComparisonData
                      ? t("weightsComparison")
                      : t("portfolioWeights")
                  }
                />
              </ChartReveal>
            </div>

            <div className="glass-card p-4 md:p-5">
              <h3 className="mb-4 font-display text-lg">
                {userPortfolioStats
                  ? t("comparisonTitle")
                  : t("negRiskDistribution")}
              </h3>
              {userPortfolioStats ? (
                <ComparisonPanel
                  optimal={{
                    expectedReturn: result.expected_return,
                    volatility: result.volatility,
                  }}
                  user={userPortfolioStats}
                />
              ) : (
                <ProbNegBars stats={result.stats} />
              )}
            </div>
          </div>

          {cumRetChartData.data.length > 0 && (
            <div className="glass-card p-4 md:p-5">
              <div className="mb-4">
                <h3 className="font-display text-lg">{t("cumulativeReturnsTitle")}</h3>
                <p className="text-xs text-muted-foreground">
                  {t("cumulativeReturnsSubtitle")}
                </p>
              </div>
              <ChartReveal>
                <CumulativeReturnsChart
                  data={cumRetChartData.data}
                  series={cumRetChartData.series}
                  highlightSeries={optimalPortfolioLabel}
                />
              </ChartReveal>
            </div>
          )}

          {negReturnData && (
            <div className="glass-card p-4 md:p-5">
              <div className="mb-4">
                <h3 className="font-display text-lg">
                  {t("probNegTitle")}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {t("probNegSubtitle")}
                </p>
              </div>
              <ChartReveal placeholderClassName="h-[220px] sm:h-[260px] md:h-[300px]">
                <ProbNegReturnChart data={negReturnData.points} />
              </ChartReveal>
            </div>
          )}
        </Tabs.Content>

        <Tabs.Content value="data" className="space-y-6">
          <div className="glass-card p-4 md:p-5">
            <h3 className="mb-4 font-display text-lg">
              {t("expReturnsAndVolTitle")}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-2 py-2 text-left font-medium">{t("tableAsset")}</th>
                    <th className="px-2 py-2 text-right font-medium">
                      {t("tableExpReturn")}
                    </th>
                    <th className="px-2 py-2 text-right font-medium">
                      {t("tableVolatility")}
                    </th>
                    <th className="px-2 py-2 text-right font-medium">{t("tableWeight")}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.weights.map((w) => (
                    <tr key={w.fund_name} className="border-b border-border/50">
                      <td className="px-2 py-2 font-medium">{w.fund_name}</td>
                      <td className="px-2 py-2 text-right">
                        {formatPercent(w.exp_ret)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {formatPercent(w.volatility)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {formatPercent(w.weight)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {assetVolatilityData.length > 0 && (
            <div className="glass-card p-4 md:p-5">
              <ChartReveal
                placeholderStyle={{
                  height: 48 + Math.max(200, assetVolatilityData.length * 40),
                }}
              >
                <AssetVolatilityChart data={assetVolatilityData} />
              </ChartReveal>
            </div>
          )}

          {rollingVolChartData.data.length > 0 && (
            <div className="glass-card p-4 md:p-5">
              <ChartReveal>
                <RollingVolatilityChart
                  data={rollingVolChartData.data}
                  series={rollingVolChartData.series}
                />
              </ChartReveal>
            </div>
          )}

          {result.debug && (
            <div className="glass-card p-4 md:p-5">
              <h3 className="mb-4 font-display text-lg">
                {t("calcStepsTitle")}
              </h3>
              <CalculationSteps
                debug={result.debug}
                tickers={result.weights.map((w) => w.fund_name)}
              />
            </div>
          )}
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

interface ComparisonPanelProps {
  optimal: { expectedReturn: number; volatility: number };
  user: { expectedReturn: number; volatility: number };
}

function ComparisonPanel({ optimal, user }: ComparisonPanelProps) {
  const t = useTranslations("MarkowitzResults");
  const rows: {
    label: string;
    optimal: number;
    user: number;
    higherIsBetter: boolean;
  }[] = [
    {
      label: t("compareReturnLabel"),
      optimal: optimal.expectedReturn,
      user: user.expectedReturn,
      higherIsBetter: true,
    },
    {
      label: t("compareVolatilityLabel"),
      optimal: optimal.volatility,
      user: user.volatility,
      higherIsBetter: false,
    },
  ];

  return (
    <div className="space-y-4">
      {rows.map((row) => {
        const max = Math.max(row.optimal, row.user, 0.0001);
        const optPct = (row.optimal / max) * 100;
        const userPct = (row.user / max) * 100;
        const diff = row.optimal - row.user;
        const optimalBetter = row.higherIsBetter ? diff > 0 : diff < 0;
        return (
          <div key={row.label} className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{row.label}</span>
              <span
                className={cn(
                  "font-mono text-xs tabular-nums",
                  optimalBetter ? "text-emerald-400" : "text-amber-400"
                )}
              >
                {diff > 0 ? "+" : ""}
                {formatPercent(diff)}
              </span>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-[11px] uppercase tracking-wider text-[#fcd9a8]/80">
                  {t("compareOptimal")}
                </span>
                <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-accent/40">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#c89853] to-[#fcd9a8] transition-all duration-700"
                    style={{ width: `${optPct}%` }}
                  />
                </div>
                <span className="w-14 text-right font-mono text-xs tabular-nums">
                  {formatPercent(row.optimal)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-[11px] uppercase tracking-wider text-amber-300/80">
                  {t("compareUserAlloc")}
                </span>
                <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-accent/40">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-500 to-amber-200 transition-all duration-700"
                    style={{ width: `${userPct}%` }}
                  />
                </div>
                <span className="w-14 text-right font-mono text-xs tabular-nums">
                  {formatPercent(row.user)}
                </span>
              </div>
            </div>
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground">
        {t("compareDisclaimer")}
      </p>
    </div>
  );
}

interface ProbNegBarsProps {
  stats: {
    prob_neg_1m: number;
    prob_neg_3m: number;
    prob_neg_1y: number;
    prob_neg_2y: number;
  };
}

function ProbNegBars({ stats }: ProbNegBarsProps) {
  const t = useTranslations("MarkowitzResults");
  const horizons = [
    { label: t("horizon1m"), value: stats.prob_neg_1m },
    { label: t("horizon3m"), value: stats.prob_neg_3m },
    { label: t("horizon1y"), value: stats.prob_neg_1y },
    { label: t("horizon2y"), value: stats.prob_neg_2y },
  ];
  const max = Math.max(...horizons.map((h) => h.value), 0.001);
  return (
    <div className="space-y-3">
      {horizons.map((h) => {
        const pct = (h.value / max) * 100;
        return (
          <div key={h.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{h.label}</span>
              <span className="font-mono font-medium tabular-nums text-foreground">
                {formatPercent(h.value)}
              </span>
            </div>
            <div className="relative h-1.5 overflow-hidden rounded-full bg-accent/40">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-rose-500/70 to-rose-300/90 transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
