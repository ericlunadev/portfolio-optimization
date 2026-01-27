"use client";

import { useState, useMemo } from "react";
import {
  useNegReturnProbability,
  useOptimizationTickers,
  useEfficientFrontierTickers,
  usePortfolioCumulativeReturnsTickers,
} from "@/hooks/useOptimization";
import { DateRangePicker, DateRange } from "@/components/forms/DateRangePicker";
import { AssetAllocationForm, AssetRow } from "@/components/forms/AssetAllocationForm";
import { ReturnSlider } from "@/components/forms/ReturnSlider";
import { RiskReturnScatterChart } from "@/components/charts/ScatterChart";
import { PortfolioWeightsChart } from "@/components/charts/PortfolioWeightsChart";
import { CumulativeReturnsChart } from "@/components/charts/CumulativeReturnsChart";
import { ProbNegReturnChart } from "@/components/charts/ProbNegReturnChart";
import { formatPercent } from "@/lib/utils";
import * as Tabs from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

function generateId() {
  return Math.random().toString(36).slice(2, 9);
}

const currentYear = new Date().getFullYear();

const INITIAL_ASSETS: AssetRow[] = Array.from({ length: 2 }, () => ({
  id: generateId(),
  ticker: "",
  allocation: null,
}));

export default function MarkowitzPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [requiredReturn, setRequiredReturn] = useState(0.06);
  const [showFrontier, setShowFrontier] = useState(true);
  const [assetConstraints, setAssetConstraints] = useState(false);
  const [wMax, setWMax] = useState(0.4);
  const [dateRange, setDateRange] = useState<DateRange>({
    startMonth: 1,
    startYear: currentYear - 5,
    endMonth: 12,
    endYear: currentYear,
  });
  const [assets, setAssets] = useState<AssetRow[]>(INITIAL_ASSETS);

  // Derive tickers from asset rows
  const selectedTickers = useMemo(
    () => assets.map((a) => a.ticker).filter(Boolean),
    [assets]
  );

  // Calculate total allocation percentage
  const totalAllocation = useMemo(() => {
    return assets.reduce((sum, a) => sum + (a.allocation ?? 0), 0);
  }, [assets]);

  // Check if any allocation has been assigned
  const hasAnyAllocation = useMemo(() => {
    return assets.some((a) => a.allocation !== null && a.allocation > 0);
  }, [assets]);

  // Validation: if any allocation is set, total must equal 100%
  const isAllocationValid = !hasAnyAllocation || Math.abs(totalAllocation - 100) < 0.01;

  // Derive user weights from allocations (normalized to 0-1)
  const userWeights = useMemo(() => {
    if (!hasAnyAllocation || !isAllocationValid) return [];
    return assets
      .filter((a) => a.ticker)
      .map((a) => (a.allocation ?? 0) / 100);
  }, [assets, hasAnyAllocation, isAllocationValid]);

  // Build date strings for API
  const startDate = useMemo(() => {
    const month = String(dateRange.startMonth).padStart(2, "0");
    return `${dateRange.startYear}-${month}-01`;
  }, [dateRange.startMonth, dateRange.startYear]);

  const endDate = useMemo(() => {
    const month = String(dateRange.endMonth).padStart(2, "0");
    const lastDay = new Date(dateRange.endYear, dateRange.endMonth, 0).getDate();
    return `${dateRange.endYear}-${month}-${String(lastDay).padStart(2, "0")}`;
  }, [dateRange.endMonth, dateRange.endYear]);

  // Ticker-based optimization (only runs when on step 2)
  const {
    data: optimizationResult,
    isLoading: loadingOptimization,
  } = useOptimizationTickers(
    step === 2 ? selectedTickers : [],
    requiredReturn,
    assetConstraints ? wMax : 1,
    startDate,
    endDate
  );

  const { data: frontierData } = useEfficientFrontierTickers(
    step === 2 && showFrontier ? selectedTickers : [],
    startDate,
    endDate
  );

  const weights = useMemo(() => {
    if (!optimizationResult) return [];
    return optimizationResult.weights.map((w) => w.weight);
  }, [optimizationResult]);

  const { data: cumulativeData } = usePortfolioCumulativeReturnsTickers(
    step === 2 ? selectedTickers : [],
    weights,
    undefined
  );

  const { data: negReturnData } = useNegReturnProbability(
    optimizationResult?.expected_return || 0,
    optimizationResult?.volatility || 0,
    36
  );

  // User portfolio cumulative returns (when they have allocations)
  const { data: userCumulativeData } = usePortfolioCumulativeReturnsTickers(
    step === 2 && hasAnyAllocation && isAllocationValid ? selectedTickers : [],
    userWeights,
    undefined
  );

  // Calculate user portfolio expected return and volatility
  const userPortfolioStats = useMemo(() => {
    if (!optimizationResult || !hasAnyAllocation || !isAllocationValid || userWeights.length === 0) {
      return null;
    }
    // Calculate weighted average expected return
    const expRet = optimizationResult.weights.reduce((sum, w, i) => {
      return sum + w.exp_ret * (userWeights[i] ?? 0);
    }, 0);

    // For volatility, we need the covariance matrix which we don't have directly
    // As an approximation, use weighted average of volatilities (this underestimates true portfolio vol)
    // A better approach would be to add an API endpoint, but this gives a reasonable estimate
    const approxVol = optimizationResult.weights.reduce((sum, w, i) => {
      return sum + w.volatility * (userWeights[i] ?? 0);
    }, 0);

    return { expectedReturn: expRet, volatility: approxVol };
  }, [optimizationResult, hasAnyAllocation, isAllocationValid, userWeights]);

  // Prepare scatter chart data (individual assets)
  const scatterData = useMemo(() => {
    if (!optimizationResult) return [];
    return optimizationResult.weights.map((w) => ({
      name: w.fund_name,
      vol: w.volatility,
      ret: w.exp_ret,
      weight: w.weight,
    }));
  }, [optimizationResult]);

  // Optimized portfolio point for scatter chart
  const optimizedPortfolioPoint = useMemo(() => {
    if (!optimizationResult) return null;
    return {
      name: "Portafolio Óptimo",
      vol: optimizationResult.volatility,
      ret: optimizationResult.expected_return,
    };
  }, [optimizationResult]);

  // User portfolio point for scatter chart
  const userPortfolioPoint = useMemo(() => {
    if (!userPortfolioStats) return null;
    return {
      name: "Tu Portafolio",
      vol: userPortfolioStats.volatility,
      ret: userPortfolioStats.expectedReturn,
    };
  }, [userPortfolioStats]);

  // Comparison data for weights chart
  const weightsComparisonData = useMemo(() => {
    if (!optimizationResult || !hasAnyAllocation || !isAllocationValid) return undefined;
    return optimizationResult.weights.map((w, i) => ({
      name: w.fund_name,
      optimalWeight: w.weight,
      userWeight: userWeights[i] ?? 0,
    }));
  }, [optimizationResult, hasAnyAllocation, isAllocationValid, userWeights]);

  const frontierPoints = useMemo(() => {
    if (!frontierData) return [];
    return frontierData.points;
  }, [frontierData]);

  // Prepare cumulative returns chart data (including user portfolio if available)
  const cumRetChartData = useMemo(() => {
    const allSeries = [...(cumulativeData?.series || [])];

    // Add user portfolio data if available
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
      return { data: [] as { date: string; [key: string]: string | number }[], series: [] as string[] };
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

  const canProceed = selectedTickers.length >= 2 && isAllocationValid;

  // Step 1: Configuration form
  if (step === 1) {
    return (
      <div className="mx-auto max-w-4xl space-y-8">
        <h1 className="text-2xl font-bold">Configuración de Portafolio</h1>

        {/* Date Range & Parameters */}
        <div className="rounded-lg border border-border p-6">
          <h2 className="mb-4 text-lg font-semibold">Parámetros</h2>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Date Range */}
            <div>
              <label className="mb-2 block text-sm font-medium">
                Rango de Fechas
              </label>
              <DateRangePicker value={dateRange} onChange={setDateRange} />
            </div>

            {/* Required Return */}
            <div>
              <ReturnSlider
                min={0.02}
                max={0.08}
                value={requiredReturn}
                onChange={setRequiredReturn}
              />
            </div>

            {/* Asset Constraints */}
            <div>
              <label className="mb-2 block text-sm font-medium">
                Restricciones de Activos
              </label>
              <select
                value={assetConstraints ? "yes" : "no"}
                onChange={(e) => setAssetConstraints(e.target.value === "yes")}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="no">No</option>
                <option value="yes">Sí</option>
              </select>
              {assetConstraints && (
                <div className="mt-2">
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Peso máximo por activo: {Math.round(wMax * 100)}%
                  </label>
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
                Mostrar Frontera Eficiente
              </label>
            </div>
          </div>
        </div>

        {/* Asset Allocation */}
        <div className="rounded-lg border border-border p-6">
          <h2 className="mb-4 text-lg font-semibold">Activos</h2>
          <AssetAllocationForm assets={assets} onChange={setAssets} />
        </div>

        {/* Next Button */}
        <div className="flex justify-end">
          <button
            onClick={() => setStep(2)}
            disabled={!canProceed}
            className={cn(
              "rounded-lg px-6 py-3 text-sm font-medium transition-colors",
              canProceed
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "cursor-not-allowed bg-muted text-muted-foreground"
            )}
          >
            Siguiente
          </button>
          {!canProceed && (
            <p className="ml-4 self-center text-sm text-muted-foreground">
              {selectedTickers.length < 2
                ? "Selecciona al menos 2 activos"
                : `La suma de asignaciones debe ser 100% (actual: ${totalAllocation.toFixed(1)}%)`}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Step 2: Results
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => setStep(1)}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
        >
          ← Volver
        </button>
        <h1 className="text-2xl font-bold">Resultados del Portafolio</h1>
      </div>

      <Tabs.Root defaultValue="portfolio" className="w-full">
        <Tabs.List className="mb-4 flex border-b border-border">
          <Tabs.Trigger
            value="portfolio"
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors",
              "border-b-2 border-transparent",
              "data-[state=active]:border-primary data-[state=active]:text-primary",
              "text-muted-foreground hover:text-foreground"
            )}
          >
            Portafolio Óptimo
          </Tabs.Trigger>
          <Tabs.Trigger
            value="data"
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors",
              "border-b-2 border-transparent",
              "data-[state=active]:border-primary data-[state=active]:text-primary",
              "text-muted-foreground hover:text-foreground"
            )}
          >
            Datos
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="portfolio" className="space-y-6">
          {loadingOptimization ? (
            <div className="flex h-64 items-center justify-center">
              <div className="text-muted-foreground">Optimizando...</div>
            </div>
          ) : optimizationResult ? (
            <>
              {/* Risk vs Return Chart */}
              <div className="rounded-lg border border-border p-4">
                <h3 className="mb-4 font-semibold">Riesgo vs Rendimiento</h3>
                <RiskReturnScatterChart
                  data={scatterData}
                  frontier={frontierPoints}
                  optimizedPortfolio={optimizedPortfolioPoint}
                  userPortfolio={userPortfolioPoint}
                />
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                {/* Portfolio Weights */}
                <div className="rounded-lg border border-border p-4">
                  <PortfolioWeightsChart
                    data={optimizationResult.weights.map((w) => ({
                      name: w.fund_name,
                      weight: w.weight,
                      ret: w.exp_ret,
                      vol: w.volatility,
                    }))}
                    comparisonData={weightsComparisonData}
                    title={weightsComparisonData ? "Comparación de Pesos" : "Pesos del Portafolio"}
                  />
                </div>

                {/* Portfolio Statistics */}
                <div className="rounded-lg border border-border p-4">
                  <h3 className="mb-4 font-semibold">
                    {userPortfolioStats ? "Comparación de Portafolios" : "Estadísticas del Portafolio"}
                  </h3>
                  {userPortfolioStats ? (
                    // Comparison table when user has entered allocations
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="px-2 py-2 text-left font-medium">Métrica</th>
                            <th className="px-2 py-2 text-right font-medium text-green-600">Óptimo</th>
                            <th className="px-2 py-2 text-right font-medium text-orange-500">Tu Portafolio</th>
                            <th className="px-2 py-2 text-right font-medium">Diferencia</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-border/50">
                            <td className="px-2 py-2 text-muted-foreground">Rendimiento Esperado</td>
                            <td className="px-2 py-2 text-right font-medium">
                              {formatPercent(optimizationResult.expected_return)}
                            </td>
                            <td className="px-2 py-2 text-right font-medium">
                              {formatPercent(userPortfolioStats.expectedReturn)}
                            </td>
                            <td className={cn(
                              "px-2 py-2 text-right font-medium",
                              optimizationResult.expected_return > userPortfolioStats.expectedReturn
                                ? "text-green-600"
                                : "text-orange-500"
                            )}>
                              {optimizationResult.expected_return >= userPortfolioStats.expectedReturn ? "+" : ""}
                              {formatPercent(optimizationResult.expected_return - userPortfolioStats.expectedReturn)}
                            </td>
                          </tr>
                          <tr className="border-b border-border/50">
                            <td className="px-2 py-2 text-muted-foreground">Volatilidad</td>
                            <td className="px-2 py-2 text-right font-medium">
                              {formatPercent(optimizationResult.volatility)}
                            </td>
                            <td className="px-2 py-2 text-right font-medium">
                              {formatPercent(userPortfolioStats.volatility)}
                            </td>
                            <td className={cn(
                              "px-2 py-2 text-right font-medium",
                              optimizationResult.volatility < userPortfolioStats.volatility
                                ? "text-green-600"
                                : "text-orange-500"
                            )}>
                              {optimizationResult.volatility >= userPortfolioStats.volatility ? "+" : ""}
                              {formatPercent(optimizationResult.volatility - userPortfolioStats.volatility)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      <p className="mt-3 text-xs text-muted-foreground">
                        * La volatilidad de tu portafolio es una aproximación basada en el promedio ponderado.
                      </p>
                    </div>
                  ) : (
                    // Original statistics when no user allocation
                    <dl className="space-y-3">
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Rendimiento Esperado</dt>
                        <dd className="font-medium">
                          {formatPercent(optimizationResult.expected_return)}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Volatilidad</dt>
                        <dd className="font-medium">
                          {formatPercent(optimizationResult.volatility)}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">IC 95% Inferior</dt>
                        <dd className="font-medium">
                          {formatPercent(optimizationResult.stats.ci_95_low)}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">IC 95% Superior</dt>
                        <dd className="font-medium">
                          {formatPercent(optimizationResult.stats.ci_95_high)}
                        </dd>
                      </div>

                      <hr className="my-3" />

                      <div className="text-sm font-medium text-muted-foreground">
                        Probabilidad de Rendimiento Negativo
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">1 Mes</dt>
                        <dd className="font-medium">
                          {formatPercent(optimizationResult.stats.prob_neg_1m)}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">3 Meses</dt>
                        <dd className="font-medium">
                          {formatPercent(optimizationResult.stats.prob_neg_3m)}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">1 Año</dt>
                        <dd className="font-medium">
                          {formatPercent(optimizationResult.stats.prob_neg_1y)}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">2 Años</dt>
                        <dd className="font-medium">
                          {formatPercent(optimizationResult.stats.prob_neg_2y)}
                        </dd>
                      </div>
                    </dl>
                  )}
                </div>
              </div>

              {/* Cumulative Returns */}
              {cumRetChartData.data.length > 0 && (
                <div className="rounded-lg border border-border p-4">
                  <h3 className="mb-4 font-semibold">
                    Rendimientos Acumulados
                  </h3>
                  <CumulativeReturnsChart
                    data={cumRetChartData.data}
                    series={cumRetChartData.series}
                    highlightSeries="Portafolio Óptimo"
                  />
                </div>
              )}

              {/* Probability of Negative Returns */}
              {negReturnData && (
                <div className="rounded-lg border border-border p-4">
                  <h3 className="mb-4 font-semibold">
                    Probabilidad de Rendimiento Negativo en el Tiempo
                  </h3>
                  <ProbNegReturnChart data={negReturnData.points} />
                </div>
              )}
            </>
          ) : (
            <div className="flex h-64 items-center justify-center text-muted-foreground">
              Selecciona al menos 2 activos para optimizar
            </div>
          )}
        </Tabs.Content>

        <Tabs.Content value="data" className="space-y-6">
          <div className="rounded-lg border border-border p-4">
            <h3 className="mb-4 font-semibold">Rendimientos Esperados y Volatilidad</h3>
            {optimizationResult ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-2 py-2 text-left font-medium">Activo</th>
                      <th className="px-2 py-2 text-right font-medium">Rend. Esperado</th>
                      <th className="px-2 py-2 text-right font-medium">Volatilidad</th>
                      <th className="px-2 py-2 text-right font-medium">Peso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {optimizationResult.weights.map((w) => (
                      <tr key={w.fund_name} className="border-b border-border/50">
                        <td className="px-2 py-2 font-medium">{w.fund_name}</td>
                        <td className="px-2 py-2 text-right">{formatPercent(w.exp_ret)}</td>
                        <td className="px-2 py-2 text-right">{formatPercent(w.volatility)}</td>
                        <td className="px-2 py-2 text-right">{formatPercent(w.weight)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Selecciona al menos 2 activos para ver los datos.
              </p>
            )}
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
