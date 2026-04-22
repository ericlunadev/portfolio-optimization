"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useOptimization } from "@/hooks/useOptimization";
import { useSaveSimulation } from "@/hooks/useSimulations";
import { OptimizationStrategy, OPTIMIZATION_STRATEGIES, SimulationParams } from "@/lib/api";
import { DateRangePicker, DateRange } from "@/components/forms/DateRangePicker";
import { AssetAllocationForm, AssetRow } from "@/components/forms/AssetAllocationForm";
import { ConstraintsPanel } from "@/components/forms/ConstraintsPanel";
import { MarkowitzResults } from "@/components/MarkowitzResults";
import * as Popover from "@radix-ui/react-popover";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { LessonButton } from "@/components/academia/LessonButton";

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
  const [showFrontier, setShowFrontier] = useState(true);
  const [assetConstraints, setAssetConstraints] = useState(false);
  const [wMax, setWMax] = useState(0.4);
  // Constraint toggles
  const [enforceFullInvestment, setEnforceFullInvestment] = useState(true);
  const [allowShortSelling, setAllowShortSelling] = useState(false);
  const [useLeverage, setUseLeverage] = useState(false);
  const [maxLeverage, setMaxLeverage] = useState(1.5);
  // Optimization strategy
  const [strategy, setStrategy] = useState<OptimizationStrategy>("max-sharpe");
  const [targetReturn, setTargetReturn] = useState(0.10); // 10% default
  const [targetRisk, setTargetRisk] = useState(0.15); // 15% default
  const [riskFreeRate, setRiskFreeRate] = useState(0.05); // 5% default
  const [dateRange, setDateRange] = useState<DateRange>({
    startMonth: 1,
    startYear: currentYear - 5,
    endMonth: 12,
    endYear: currentYear,
  });
  const [assets, setAssets] = useState<AssetRow[]>(INITIAL_ASSETS);

  // Auto-save simulation
  const saveSimulation = useSaveSimulation();
  const hasSavedRef = useRef(false);

  // Build current simulation params
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

  // Get the current strategy config
  const currentStrategy = OPTIMIZATION_STRATEGIES.find((s) => s.value === strategy);

  // Ticker-based optimization (only runs when on step 2)
  const {
    data: optimizationResult,
    isLoading: loadingOptimization,
  } = useOptimization(
    step === 2 ? selectedTickers : [],
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

  // Auto-save simulation when results are available on step 2
  useEffect(() => {
    if (step === 2 && optimizationResult && !hasSavedRef.current) {
      hasSavedRef.current = true;
      saveSimulation.mutate(
        { params: currentSimulationParams, result: optimizationResult },
        {
          onError: () => {
            hasSavedRef.current = false;
          },
        }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, optimizationResult]);

  // Reset save ref when going back to step 1
  useEffect(() => {
    if (step === 1) {
      hasSavedRef.current = false;
    }
  }, [step]);

  const canProceed = selectedTickers.length >= 2 && isAllocationValid;

  // Step 1: Configuration form
  if (step === 1) {
    return (
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-3xl tracking-tight">Configuración de Portafolio</h1>
          <LessonButton
            station="portfolio"
            label="¿Primera vez? Ver guía Top-Down"
          />
        </div>

        {/* Date Range & Parameters */}
        <div className="glass-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg">Parámetros</h2>
            <LessonButton
              station="allocation"
              variant="inline"
              label="¿Cómo elegir?"
            />
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Date Range */}
            <div>
              <div className="mb-2 flex items-center gap-1.5">
                <label className="block text-sm font-medium">
                  Rango de Fechas
                </label>
                <Popover.Root>
                  <Popover.Trigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      aria-label="Información sobre rango de fechas"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Content
                      className="z-50 w-80 rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-lg"
                      sideOffset={5}
                      align="start"
                    >
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold">Rango de Fechas</h4>
                        <p className="text-xs text-muted-foreground">
                          Define el periodo historico de datos que se utilizara para calcular rendimientos esperados, volatilidades y correlaciones entre activos.
                        </p>
                        <p className="text-xs text-muted-foreground">
                          <strong>Inicio:</strong> Primer mes del periodo de analisis. Se toman datos desde el primer dia del mes seleccionado.
                        </p>
                        <p className="text-xs text-muted-foreground">
                          <strong>Fin:</strong> Ultimo mes del periodo de analisis. Se toman datos hasta el ultimo dia del mes seleccionado.
                        </p>
                        <p className="text-xs text-muted-foreground">
                          <strong>Recomendacion:</strong> Un periodo de 3 a 5 anos ofrece un buen balance entre capturar tendencias de mercado y evitar datos obsoletos. Periodos mas largos suavizan la volatilidad pero pueden incluir condiciones de mercado que ya no son relevantes.
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
                  Estrategia de Optimización
                </label>
                <Popover.Root>
                  <Popover.Trigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      aria-label="Información sobre estrategias de optimización"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Content
                      className="z-50 w-80 rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-lg"
                      sideOffset={5}
                      align="start"
                    >
                      <div className="space-y-3">
                        <p className="text-sm font-medium">
                          Estrategias de Optimización de Portafolio
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Selecciona como quieres optimizar tu portafolio segun la teoria de Markowitz:
                        </p>
                        <ul className="space-y-2 text-xs">
                          <li>
                            <span className="font-medium">Maximo Sharpe:</span>{" "}
                            <span className="text-muted-foreground">
                              Maximiza el rendimiento ajustado por riesgo usando el ratio de Sharpe. Ideal para obtener el mejor equilibrio entre riesgo y rendimiento.
                            </span>
                          </li>
                          <li>
                            <span className="font-medium">Minimo Riesgo:</span>{" "}
                            <span className="text-muted-foreground">
                              Minimiza la volatilidad del portafolio. Recomendado para inversores conservadores.
                            </span>
                          </li>
                          <li>
                            <span className="font-medium">Maximo Rendimiento:</span>{" "}
                            <span className="text-muted-foreground">
                              Maximiza el rendimiento esperado sin considerar el riesgo. Para inversores agresivos.
                            </span>
                          </li>
                          <li>
                            <span className="font-medium">Rendimiento Objetivo:</span>{" "}
                            <span className="text-muted-foreground">
                              Encuentra el portafolio de minimo riesgo que alcance un rendimiento especifico.
                            </span>
                          </li>
                          <li>
                            <span className="font-medium">Riesgo Objetivo:</span>{" "}
                            <span className="text-muted-foreground">
                              Encuentra el portafolio de maximo rendimiento para un nivel de riesgo especifico.
                            </span>
                          </li>
                          <li>
                            <span className="font-medium">Punto de Inflexion:</span>{" "}
                            <span className="text-muted-foreground">
                              Identifica el punto de maxima curvatura en la frontera eficiente, donde el beneficio marginal de asumir mas riesgo comienza a disminuir.
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
                    {s.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                {currentStrategy?.description}
              </p>

              {/* Target Return Input */}
              {strategy === "target-return" && (
                <div className="mt-3">
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Rendimiento objetivo: {(targetReturn * 100).toFixed(1)}%
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

              {/* Target Risk Input */}
              {strategy === "target-risk" && (
                <div className="mt-3">
                  <div className="mb-1 flex items-center gap-1">
                    <label className="text-xs text-muted-foreground">
                      Riesgo objetivo (volatilidad): {(targetRisk * 100).toFixed(1)}%
                    </label>
                    <Popover.Root>
                      <Popover.Trigger asChild>
                        <button
                          type="button"
                          className="inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                          aria-label="Informacion sobre riesgo objetivo"
                        >
                          <Info className="h-3.5 w-3.5" />
                        </button>
                      </Popover.Trigger>
                      <Popover.Portal>
                        <Popover.Content
                          className="z-50 w-80 rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-md"
                          sideOffset={5}
                          align="start"
                        >
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold">Riesgo Objetivo (Volatilidad)</h4>
                            <p className="text-xs text-muted-foreground">
                              Este parametro establece la volatilidad maxima permitida para el portafolio. La volatilidad mide la dispersion de los rendimientos y se expresa como porcentaje anualizado.
                            </p>
                            <p className="text-xs text-muted-foreground">
                              <strong>Como funciona:</strong> El optimizador busca el portafolio con el mayor rendimiento esperado cuya volatilidad no exceda el valor objetivo. Si existen multiples portafolios que cumplen la restriccion, se selecciona el de mayor rendimiento.
                            </p>
                            <p className="text-xs text-muted-foreground">
                              <strong>Factibilidad:</strong> Si el riesgo objetivo es menor que la volatilidad minima alcanzable (portafolio de minima varianza), el optimizador devolvera el portafolio de menor riesgo posible. Valores tipicos estan entre 10% y 25% anual.
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

              {/* Risk-Free Rate Input for Max Sharpe */}
              {strategy === "max-sharpe" && (
                <div className="mt-3">
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Tasa libre de riesgo: {(riskFreeRate * 100).toFixed(1)}%
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={0.30}
                    step={0.01}
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
                  Restricciones de Activos
                </label>
                <Popover.Root>
                  <Popover.Trigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      aria-label="Información sobre restricciones de activos"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Content
                      className="z-50 w-80 rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-lg"
                      sideOffset={5}
                      align="start"
                    >
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold">Restricciones de Activos</h4>
                        <p className="text-xs text-muted-foreground">
                          Permite imponer limites sobre el peso maximo que cada activo individual puede tener en el portafolio optimizado.
                        </p>
                        <p className="text-xs text-muted-foreground">
                          <strong>Sin restricciones:</strong> El optimizador puede asignar cualquier peso entre 0% y 100% a cada activo, lo que puede resultar en portafolios muy concentrados.
                        </p>
                        <p className="text-xs text-muted-foreground">
                          <strong>Con restricciones:</strong> Se establece un peso maximo por activo, forzando una mayor diversificacion. Por ejemplo, un limite de 30% asegura que ningun activo represente mas de ese porcentaje del portafolio.
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
                <option value="no">No</option>
                <option value="yes">Sí</option>
              </select>
              {assetConstraints && (
                <div className="mt-2">
                  <div className="mb-1 flex items-center gap-1">
                    <label className="text-xs text-muted-foreground">
                      Peso maximo por activo: {Math.round(wMax * 100)}%
                    </label>
                    <Popover.Root>
                      <Popover.Trigger asChild>
                        <button
                          type="button"
                          className="inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                          aria-label="Informacion sobre peso maximo por activo"
                        >
                          <Info className="h-3.5 w-3.5" />
                        </button>
                      </Popover.Trigger>
                      <Popover.Portal>
                        <Popover.Content
                          className="z-50 w-80 rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-md"
                          sideOffset={5}
                          align="start"
                        >
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold">Peso Maximo por Activo</h4>
                            <p className="text-xs text-muted-foreground">
                              Este parametro limita la concentracion maxima que puede tener un solo activo en el portafolio optimizado.
                            </p>
                            <p className="text-xs text-muted-foreground">
                              <strong>Por que es importante:</strong> La concentracion excesiva en un solo activo aumenta el riesgo especifico. Si una empresa o sector tiene problemas, un portafolio muy concentrado sufrira perdidas significativas.
                            </p>
                            <p className="text-xs text-muted-foreground">
                              <strong>Efecto en la optimizacion:</strong> Un limite mas bajo fuerza mayor diversificacion, lo que generalmente reduce el riesgo pero puede disminuir el rendimiento esperado. Un limite mas alto permite al optimizador concentrar mas capital en los activos con mejor relacion riesgo-rendimiento.
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
                Mostrar Frontera Eficiente
              </label>
            </div>
          </div>
        </div>

        {/* Portfolio Constraints */}
        <div className="glass-card p-6">
          <h2 className="mb-4 font-display text-lg">Restricciones del Portafolio</h2>
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
        <div className="glass-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg">Activos</h2>
            <LessonButton
              station="assets"
              variant="inline"
              label="¿Cómo elegir activos?"
            />
          </div>
          <AssetAllocationForm assets={assets} onChange={setAssets} />
        </div>

        {/* Next Button */}
        <div className="flex justify-end">
          <button
            onClick={() => setStep(2)}
            disabled={!canProceed}
            className={cn(
              "rounded-lg px-6 py-3 text-sm font-semibold transition-all",
              canProceed
                ? "bg-primary text-primary-foreground hover:brightness-110 glow-gold"
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
          className="rounded-lg border border-border/50 bg-card/60 px-4 py-2 text-sm font-medium transition-all hover:bg-accent hover:border-border"
        >
          ← Volver
        </button>
        <h1 className="font-display text-3xl tracking-tight">Resultados del Portafolio</h1>
      </div>

      {loadingOptimization ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          <div className="text-sm text-muted-foreground">Optimizando portafolio...</div>
        </div>
      ) : optimizationResult ? (
        <MarkowitzResults
          params={currentSimulationParams}
          result={optimizationResult}
        />
      ) : (
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          Selecciona al menos 2 activos para optimizar
        </div>
      )}
    </div>
  );
}
