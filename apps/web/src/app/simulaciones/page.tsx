"use client";

import { useState } from "react";
import { useSimulations, useSimulation, useDeleteSimulation } from "@/hooks/useSimulations";
import { SimulationParamsSummary } from "@/components/SimulationParamsSummary";
import { OPTIMIZATION_STRATEGIES } from "@/lib/api";
import { formatPercent, cn } from "@/lib/utils";
import { Trash2, ChevronDown, BarChart3 } from "lucide-react";

export default function SimulacionesPage() {
  const { data: simulations, isLoading } = useSimulations();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const deleteSimulation = useDeleteSimulation();

  function handleDelete(id: string) {
    if (deletingId === id) {
      // Confirm deletion
      deleteSimulation.mutate(id, {
        onSuccess: () => setDeletingId(null),
      });
    } else {
      setDeletingId(id);
      // Reset confirm state after 3 seconds
      setTimeout(() => setDeletingId((prev) => (prev === id ? null : prev)), 3000);
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">Cargando simulaciones...</div>
      </div>
    );
  }

  if (!simulations || simulations.length === 0) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <h1 className="font-display text-3xl tracking-tight">Simulaciones</h1>
        <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border/50 bg-card/30">
          <BarChart3 className="mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-muted-foreground">
            No hay simulaciones guardadas
          </p>
          <p className="mt-1 text-sm text-muted-foreground/70">
            Las simulaciones se guardan automáticamente al ver los resultados en Markowitz
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="font-display text-3xl tracking-tight">Simulaciones</h1>

      <div className="space-y-3">
        {simulations.map((sim) => (
          <SimulationCard
            key={sim.id}
            sim={sim}
            isExpanded={expandedId === sim.id}
            onToggle={() =>
              setExpandedId((prev) => (prev === sim.id ? null : sim.id))
            }
            onDelete={() => handleDelete(sim.id)}
            isConfirmingDelete={deletingId === sim.id}
            isDeleting={deleteSimulation.isPending && deletingId === sim.id}
          />
        ))}
      </div>
    </div>
  );
}

function SimulationCard({
  sim,
  isExpanded,
  onToggle,
  onDelete,
  isConfirmingDelete,
  isDeleting,
}: {
  sim: {
    id: string;
    name: string;
    tickers: string[];
    strategy: string;
    expectedReturn: number;
    volatility: number;
    sharpeRatio: number;
    createdAt: string;
  };
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  isConfirmingDelete: boolean;
  isDeleting: boolean;
}) {
  const strategyLabel =
    OPTIMIZATION_STRATEGIES.find((s) => s.value === sim.strategy)?.label ??
    sim.strategy;

  const formattedDate = formatCreatedAt(sim.createdAt);

  return (
    <div className="glass-card">
      {/* Summary Row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={onToggle}
          className="flex flex-1 items-center gap-3 text-left"
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              isExpanded && "rotate-180"
            )}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <h3 className="truncate text-sm font-medium">{sim.name}</h3>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formattedDate}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {sim.tickers.slice(0, 6).map((t) => (
                <span
                  key={t}
                  className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium"
                >
                  {t}
                </span>
              ))}
              {sim.tickers.length > 6 && (
                <span className="text-[10px] text-muted-foreground">
                  +{sim.tickers.length - 6}
                </span>
              )}
            </div>
          </div>
        </button>

        {/* Metrics */}
        <div className="hidden gap-4 text-right text-xs sm:flex">
          <div>
            <div className="text-muted-foreground">Rendimiento</div>
            <div className="font-medium">{formatPercent(sim.expectedReturn)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Volatilidad</div>
            <div className="font-medium">{formatPercent(sim.volatility)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Sharpe</div>
            <div className="font-medium">{sim.sharpeRatio.toFixed(2)}</div>
          </div>
        </div>

        {/* Delete */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          disabled={isDeleting}
          className={cn(
            "shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors",
            isConfirmingDelete
              ? "bg-red-900/20 text-red-400"
              : "hover:bg-muted hover:text-foreground"
          )}
          title={isConfirmingDelete ? "Confirmar eliminación" : "Eliminar simulación"}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Mobile Metrics */}
      <div className="flex gap-4 border-t border-border/50 px-4 py-2 text-xs sm:hidden">
        <div>
          <span className="text-muted-foreground">Rend: </span>
          <span className="font-medium">{formatPercent(sim.expectedReturn)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Vol: </span>
          <span className="font-medium">{formatPercent(sim.volatility)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Sharpe: </span>
          <span className="font-medium">{sim.sharpeRatio.toFixed(2)}</span>
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && <SimulationDetails id={sim.id} />}
    </div>
  );
}

function SimulationDetails({ id }: { id: string }) {
  const { data: simulation, isLoading } = useSimulation(id);

  if (isLoading) {
    return (
      <div className="border-t border-border px-4 py-6 text-center text-sm text-muted-foreground">
        Cargando detalles...
      </div>
    );
  }

  if (!simulation) {
    return (
      <div className="border-t border-border px-4 py-6 text-center text-sm text-muted-foreground">
        No se pudieron cargar los detalles
      </div>
    );
  }

  const result = simulation.result;

  return (
    <div className="space-y-4 border-t border-border px-4 py-4">
      {/* Params Summary */}
      <SimulationParamsSummary params={simulation.params} defaultOpen />

      {/* Key Results */}
      <div className="glass-card p-4">
        <h4 className="mb-3 text-sm font-semibold">Resultados</h4>
        <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Rendimiento Esperado</dt>
            <dd className="font-medium">{formatPercent(result.expected_return)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Volatilidad</dt>
            <dd className="font-medium">{formatPercent(result.volatility)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Ratio de Sharpe</dt>
            <dd className="font-medium">{result.sharpe_ratio?.toFixed(2) ?? "N/A"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">IC 95%</dt>
            <dd className="font-medium">
              {formatPercent(result.stats.ci_95_low)} — {formatPercent(result.stats.ci_95_high)}
            </dd>
          </div>
        </dl>

        {/* Weights */}
        {result.weights && result.weights.length > 0 && (
          <div className="mt-4 border-t border-border/50 pt-3">
            <h5 className="mb-2 text-xs font-medium text-muted-foreground">
              Pesos del Portafolio
            </h5>
            <div className="flex flex-wrap gap-2">
              {result.weights
                .filter((w) => Math.abs(w.weight) > 0.001)
                .sort((a, b) => b.weight - a.weight)
                .map((w) => (
                  <span
                    key={w.fund_name}
                    className="rounded-md bg-muted px-2 py-1 text-xs"
                  >
                    <span className="font-medium">{w.fund_name}</span>{" "}
                    <span className="text-muted-foreground">
                      {formatPercent(w.weight)}
                    </span>
                  </span>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatCreatedAt(isoString: string): string {
  try {
    const date = new Date(isoString);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch {
    return isoString;
  }
}
