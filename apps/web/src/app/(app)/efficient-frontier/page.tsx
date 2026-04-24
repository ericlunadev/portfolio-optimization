"use client";

import { useState } from "react";
import Link from "next/link";
import { useSimulations, useDeleteSimulation } from "@/hooks/useSimulations";
import { formatPercent, cn } from "@/lib/utils";
import { Trash2, BarChart3, ChevronRight, Plus } from "lucide-react";

export default function EfficientFrontierPage() {
  const { data: simulations, isLoading } = useSimulations();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const deleteSimulation = useDeleteSimulation();

  function handleDelete(id: string) {
    if (deletingId === id) {
      deleteSimulation.mutate(id, {
        onSuccess: () => setDeletingId(null),
      });
    } else {
      setDeletingId(id);
      setTimeout(
        () => setDeletingId((prev) => (prev === id ? null : prev)),
        3000
      );
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl md:text-3xl tracking-tight">
            Frontera Eficiente
          </h1>
          <Link
            href="/efficient-frontier/new"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 glow-gold"
          >
            <Plus className="h-4 w-4" />
            Optimización
          </Link>
        </div>
        <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border/50 bg-card/30">
          <BarChart3 className="mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-muted-foreground">
            Aún no has corrido ninguna optimización
          </p>
          <p className="mt-1 text-sm text-muted-foreground/70">
            Pulsa &quot;Optimización&quot; para configurar tu primer portafolio
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl md:text-3xl tracking-tight">
          Frontera Eficiente
        </h1>
        <Link
          href="/efficient-frontier/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 glow-gold"
        >
          <Plus className="h-4 w-4" />
          Optimización
        </Link>
      </div>

      <div className="space-y-3">
        {simulations.map((sim) => (
          <SimulationCard
            key={sim.id}
            sim={sim}
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
  onDelete: () => void;
  isConfirmingDelete: boolean;
  isDeleting: boolean;
}) {
  const formattedDate = formatCreatedAt(sim.createdAt);

  return (
    <div className="glass-card group transition-colors hover:border-border">
      <div className="flex items-center gap-3 px-4 py-3">
        <Link
          href={`/efficient-frontier/${sim.id}`}
          className="flex flex-1 items-center gap-3 text-left"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <h3 className="truncate text-sm font-medium group-hover:text-primary transition-colors">
                {sim.name}
              </h3>
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

          <div className="hidden gap-4 text-right text-xs sm:flex">
            <div>
              <div className="text-muted-foreground">Rendimiento</div>
              <div className="font-medium">
                {formatPercent(sim.expectedReturn)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Volatilidad</div>
              <div className="font-medium">
                {formatPercent(sim.volatility)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Sharpe</div>
              <div className="font-medium">{sim.sharpeRatio.toFixed(2)}</div>
            </div>
          </div>

          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
        </Link>

        <button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onDelete();
          }}
          disabled={isDeleting}
          className={cn(
            "shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors",
            isConfirmingDelete
              ? "bg-red-900/20 text-red-400"
              : "hover:bg-muted hover:text-foreground"
          )}
          title={
            isConfirmingDelete
              ? "Confirmar eliminación"
              : "Eliminar simulación"
          }
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="flex gap-4 border-t border-border/50 px-4 py-2 text-xs sm:hidden">
        <div>
          <span className="text-muted-foreground">Rend: </span>
          <span className="font-medium">
            {formatPercent(sim.expectedReturn)}
          </span>
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
