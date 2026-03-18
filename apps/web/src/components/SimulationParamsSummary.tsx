"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { SimulationParams, OPTIMIZATION_STRATEGIES } from "@/lib/api";

interface SimulationParamsSummaryProps {
  params: SimulationParams;
  defaultOpen?: boolean;
}

export function SimulationParamsSummary({
  params,
  defaultOpen = false,
}: SimulationParamsSummaryProps) {
  const [open, setOpen] = useState(defaultOpen);

  const strategyLabel =
    OPTIMIZATION_STRATEGIES.find((s) => s.value === params.strategy)?.label ??
    params.strategy;

  const startDate = `01/${String(params.dateRange.startMonth).padStart(2, "0")}/${params.dateRange.startYear}`;
  const endMonth = params.dateRange.endMonth;
  const endYear = params.dateRange.endYear;
  const lastDay = new Date(endYear, endMonth, 0).getDate();
  const endDate = `${String(lastDay).padStart(2, "0")}/${String(endMonth).padStart(2, "0")}/${endYear}`;

  return (
    <div className="rounded-lg border border-border">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
      >
        <span>Parámetros de Simulación</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="border-t border-border px-4 py-3">
          <div className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            {/* Date Range */}
            <div>
              <dt className="text-muted-foreground">Rango de Fechas</dt>
              <dd className="font-medium">
                {startDate} — {endDate}
              </dd>
            </div>

            {/* Strategy */}
            <div>
              <dt className="text-muted-foreground">Estrategia</dt>
              <dd className="font-medium">{strategyLabel}</dd>
            </div>

            {/* Risk-Free Rate (max-sharpe only) */}
            {params.strategy === "max-sharpe" && (
              <div>
                <dt className="text-muted-foreground">Tasa Libre de Riesgo</dt>
                <dd className="font-medium">
                  {(params.riskFreeRate * 100).toFixed(1)}%
                </dd>
              </div>
            )}

            {/* Target Return */}
            {params.strategy === "target-return" && params.targetReturn !== undefined && (
              <div>
                <dt className="text-muted-foreground">Rendimiento Objetivo</dt>
                <dd className="font-medium">
                  {(params.targetReturn * 100).toFixed(1)}%
                </dd>
              </div>
            )}

            {/* Target Risk */}
            {params.strategy === "target-risk" && params.targetRisk !== undefined && (
              <div>
                <dt className="text-muted-foreground">Riesgo Objetivo</dt>
                <dd className="font-medium">
                  {(params.targetRisk * 100).toFixed(1)}%
                </dd>
              </div>
            )}

            {/* Constraints */}
            <div>
              <dt className="text-muted-foreground">Inversión Completa</dt>
              <dd className="font-medium">
                {params.enforceFullInvestment ? "Sí" : "No"}
              </dd>
            </div>

            <div>
              <dt className="text-muted-foreground">Ventas en Corto</dt>
              <dd className="font-medium">
                {params.allowShortSelling ? "Permitidas" : "No permitidas"}
              </dd>
            </div>

            {params.useLeverage && (
              <div>
                <dt className="text-muted-foreground">Apalancamiento Máximo</dt>
                <dd className="font-medium">
                  {(params.maxLeverage * 100).toFixed(0)}% ({params.maxLeverage.toFixed(1)}x)
                </dd>
              </div>
            )}

            {params.assetConstraints && (
              <div>
                <dt className="text-muted-foreground">Peso Máximo por Activo</dt>
                <dd className="font-medium">
                  {Math.round(params.wMax * 100)}%
                </dd>
              </div>
            )}
          </div>

          {/* Tickers */}
          <div className="mt-3 border-t border-border/50 pt-3">
            <dt className="mb-1.5 text-sm text-muted-foreground">Activos</dt>
            <div className="flex flex-wrap gap-1.5">
              {params.tickers.map((ticker) => (
                <span
                  key={ticker}
                  className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium"
                >
                  {ticker}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
