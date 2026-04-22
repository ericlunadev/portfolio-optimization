"use client";

import { useParams, useRouter } from "next/navigation";
import { useSimulation } from "@/hooks/useSimulations";
import { MarkowitzResults } from "@/components/MarkowitzResults";

export default function SimulationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: simulation, isLoading } = useSimulation(params.id);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">Cargando simulación...</div>
      </div>
    );
  }

  if (!simulation) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/simulaciones")}
            className="rounded-lg border border-border/50 bg-card/60 px-4 py-2 text-sm font-medium transition-all hover:bg-accent hover:border-border"
          >
            ← Volver
          </button>
        </div>
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          No se encontró la simulación
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 md:gap-4">
        <button
          onClick={() => router.push("/simulaciones")}
          className="shrink-0 rounded-lg border border-border/50 bg-card/60 px-3 py-2 text-sm font-medium transition-all hover:bg-accent hover:border-border md:px-4"
        >
          ← Volver
        </button>
        <h1 className="min-w-0 flex-1 truncate font-display text-xl tracking-tight md:text-3xl">
          {simulation.name}
        </h1>
      </div>

      <MarkowitzResults
        params={simulation.params}
        result={simulation.result}
      />
    </div>
  );
}
