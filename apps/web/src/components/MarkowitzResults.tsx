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
import { CalculationSteps } from "@/components/debug/CalculationSteps";
import { cn, formatPercent } from "@/lib/utils";
import * as Tabs from "@radix-ui/react-tabs";

interface MarkowitzResultsProps {
  params: SimulationParams;
  result: OptimizationResultWithStrategy;
}

export function MarkowitzResults({ params, result }: MarkowitzResultsProps) {
  const [debugTangentSlope, setDebugTangentSlope] = useState(false);

  const selectedTickers = params.tickers;
  const currentStrategy = OPTIMIZATION_STRATEGIES.find(
    (s) => s.value === params.strategy
  );

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
    const strategyLabel = currentStrategy?.label ?? "Portafolio Óptimo";
    return {
      name: strategyLabel,
      vol: result.volatility,
      ret: result.expected_return,
    };
  }, [result, currentStrategy]);

  const userPortfolioPoint = useMemo(() => {
    if (!userPortfolioStats) return null;
    return {
      name: "Tu Portafolio",
      vol: userPortfolioStats.volatility,
      ret: userPortfolioStats.expectedReturn,
    };
  }, [userPortfolioStats]);

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
    const allSeries = [...(cumulativeData?.series || [])];

    if (userCumulativeData?.series) {
      const userPortfolioSeries = userCumulativeData.series.find(
        (s) => s.name === "Portafolio Óptimo"
      );
      if (userPortfolioSeries) {
        allSeries.push({
          name: "Tu Portafolio",
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
  }, [cumulativeData, userCumulativeData]);

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
            {currentStrategy?.label || "Portafolio Óptimo"}
          </Tabs.Trigger>
          <Tabs.Trigger
            value="data"
            className={cn(
              "whitespace-nowrap px-4 py-2 text-sm font-medium transition-all duration-200 rounded-lg sm:px-5",
              "data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm",
              "text-muted-foreground hover:text-foreground"
            )}
          >
            Datos
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="portfolio" className="space-y-6">
          <div className="glass-card p-4 md:p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg">Riesgo vs Rendimiento</h3>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={debugTangentSlope}
                  onChange={(e) => setDebugTangentSlope(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                Debug
              </label>
            </div>
            <RiskReturnScatterChart
              data={scatterData}
              frontier={frontierPoints}
              frontierTickers={frontierData?.tickers}
              optimizedPortfolio={optimizedPortfolioPoint}
              userPortfolio={userPortfolioPoint}
              showTangentSlope={debugTangentSlope}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 md:gap-6">
            <div className="glass-card p-4 md:p-5">
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
                    ? "Comparación de Pesos"
                    : "Pesos del Portafolio"
                }
              />
            </div>

            <div className="glass-card p-4 md:p-5">
              <h3 className="mb-4 font-display text-lg">
                {userPortfolioStats
                  ? "Comparación de Portafolios"
                  : "Estadísticas del Portafolio"}
              </h3>
              {userPortfolioStats ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-2 py-2 text-left font-medium">
                          Métrica
                        </th>
                        <th className="px-2 py-2 text-right font-medium text-emerald-400">
                          Óptimo
                        </th>
                        <th className="px-2 py-2 text-right font-medium text-amber-400">
                          Tu Portafolio
                        </th>
                        <th className="px-2 py-2 text-right font-medium">
                          Diferencia
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-border/50">
                        <td className="px-2 py-2 text-muted-foreground">
                          Rendimiento Esperado
                        </td>
                        <td className="px-2 py-2 text-right font-medium">
                          {formatPercent(result.expected_return)}
                        </td>
                        <td className="px-2 py-2 text-right font-medium">
                          {formatPercent(userPortfolioStats.expectedReturn)}
                        </td>
                        <td
                          className={cn(
                            "px-2 py-2 text-right font-medium",
                            result.expected_return >
                              userPortfolioStats.expectedReturn
                              ? "text-emerald-400"
                              : "text-amber-400"
                          )}
                        >
                          {result.expected_return >=
                          userPortfolioStats.expectedReturn
                            ? "+"
                            : ""}
                          {formatPercent(
                            result.expected_return -
                              userPortfolioStats.expectedReturn
                          )}
                        </td>
                      </tr>
                      <tr className="border-b border-border/50">
                        <td className="px-2 py-2 text-muted-foreground">
                          Volatilidad
                        </td>
                        <td className="px-2 py-2 text-right font-medium">
                          {formatPercent(result.volatility)}
                        </td>
                        <td className="px-2 py-2 text-right font-medium">
                          {formatPercent(userPortfolioStats.volatility)}
                        </td>
                        <td
                          className={cn(
                            "px-2 py-2 text-right font-medium",
                            result.volatility < userPortfolioStats.volatility
                              ? "text-emerald-400"
                              : "text-amber-400"
                          )}
                        >
                          {result.volatility >= userPortfolioStats.volatility
                            ? "+"
                            : ""}
                          {formatPercent(
                            result.volatility - userPortfolioStats.volatility
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="mt-3 text-xs text-muted-foreground">
                    * La volatilidad de tu portafolio es una aproximación
                    basada en el promedio ponderado.
                  </p>
                </div>
              ) : (
                <dl className="space-y-3">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">
                      Rendimiento Esperado
                    </dt>
                    <dd className="font-medium">
                      {formatPercent(result.expected_return)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Volatilidad</dt>
                    <dd className="font-medium">
                      {formatPercent(result.volatility)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Ratio de Sharpe</dt>
                    <dd className="font-medium">
                      {result.sharpe_ratio?.toFixed(2) ?? "N/A"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">IC 95% Inferior</dt>
                    <dd className="font-medium">
                      {formatPercent(result.stats.ci_95_low)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">IC 95% Superior</dt>
                    <dd className="font-medium">
                      {formatPercent(result.stats.ci_95_high)}
                    </dd>
                  </div>

                  <hr className="my-3" />

                  <div className="text-sm font-medium text-muted-foreground">
                    Probabilidad de Rendimiento Negativo
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">1 Mes</dt>
                    <dd className="font-medium">
                      {formatPercent(result.stats.prob_neg_1m)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">3 Meses</dt>
                    <dd className="font-medium">
                      {formatPercent(result.stats.prob_neg_3m)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">1 Año</dt>
                    <dd className="font-medium">
                      {formatPercent(result.stats.prob_neg_1y)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">2 Años</dt>
                    <dd className="font-medium">
                      {formatPercent(result.stats.prob_neg_2y)}
                    </dd>
                  </div>
                </dl>
              )}
            </div>
          </div>

          {cumRetChartData.data.length > 0 && (
            <div className="glass-card p-4 md:p-5">
              <h3 className="mb-4 font-display text-lg">
                Rendimientos Acumulados
              </h3>
              <CumulativeReturnsChart
                data={cumRetChartData.data}
                series={cumRetChartData.series}
                highlightSeries="Portafolio Óptimo"
              />
            </div>
          )}

          {negReturnData && (
            <div className="glass-card p-4 md:p-5">
              <h3 className="mb-4 font-display text-lg">
                Probabilidad de Rendimiento Negativo en el Tiempo
              </h3>
              <ProbNegReturnChart data={negReturnData.points} />
            </div>
          )}
        </Tabs.Content>

        <Tabs.Content value="data" className="space-y-6">
          <div className="glass-card p-4 md:p-5">
            <h3 className="mb-4 font-display text-lg">
              Rendimientos Esperados y Volatilidad
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-2 py-2 text-left font-medium">Activo</th>
                    <th className="px-2 py-2 text-right font-medium">
                      Rend. Esperado
                    </th>
                    <th className="px-2 py-2 text-right font-medium">
                      Volatilidad
                    </th>
                    <th className="px-2 py-2 text-right font-medium">Peso</th>
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
              <AssetVolatilityChart data={assetVolatilityData} />
            </div>
          )}

          {rollingVolChartData.data.length > 0 && (
            <div className="glass-card p-4 md:p-5">
              <RollingVolatilityChart
                data={rollingVolChartData.data}
                series={rollingVolChartData.series}
              />
            </div>
          )}

          {result.debug && (
            <div className="glass-card p-4 md:p-5">
              <h3 className="mb-4 font-display text-lg">
                Proceso de Cálculo (Debug)
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
