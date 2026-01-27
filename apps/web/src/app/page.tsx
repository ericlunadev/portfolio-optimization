import Link from "next/link";
import { BarChart3 } from "lucide-react";

export default function Home() {
  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Optimización de Portafolio</h1>

      <div className="grid gap-6 md:grid-cols-1 max-w-md">
        <Link
          href="/markowitz"
          className="group rounded-lg border border-border p-6 hover:border-primary hover:bg-muted/50 transition-colors"
        >
          <div className="mb-4">
            <BarChart3 className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold mb-2 group-hover:text-primary">
            Optimización Markowitz
          </h2>
          <p className="text-muted-foreground">
            Encuentra los pesos óptimos del portafolio usando optimización de media-varianza.
            Visualiza la frontera eficiente, métricas de riesgo y gráficos de rendimiento.
          </p>
        </Link>
      </div>
    </div>
  );
}
