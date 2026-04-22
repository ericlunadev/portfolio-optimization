import Link from "next/link";
import { BarChart3, TrendingUp, Shield, Zap } from "lucide-react";
import { WelcomeCard } from "@/components/academia/WelcomeCard";

const features = [
  {
    icon: BarChart3,
    title: "Frontera Eficiente",
    description:
      "Visualiza el conjunto óptimo de portafolios que ofrecen el mayor rendimiento para cada nivel de riesgo.",
  },
  {
    icon: TrendingUp,
    title: "6 Estrategias",
    description:
      "Desde Máximo Sharpe hasta Punto de Inflexión. Elige la estrategia que mejor se adapte a tu perfil.",
  },
  {
    icon: Shield,
    title: "Análisis de Riesgo",
    description:
      "Probabilidad de rendimiento negativo, volatilidad histórica y métricas de confianza para decisiones informadas.",
  },
];

export default function Home() {
  return (
    <div className="max-w-5xl mx-auto space-y-10">
      <WelcomeCard />

      {/* Hero */}
      <div className="space-y-6 pt-4 animate-fade-in-up">
        <h1 className="font-display text-5xl md:text-6xl tracking-tight leading-[1.1]">
          Optimización de{" "}
          <span className="text-gradient-gold">Portafolio</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
          Encuentra la asignación óptima de activos usando la teoría de
          media-varianza de Markowitz. Visualiza la frontera eficiente y
          maximiza tu rendimiento ajustado por riesgo.
        </p>
        <Link
          href="/markowitz"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 glow-gold"
        >
          <Zap className="h-4 w-4" />
          Comenzar Optimización
        </Link>
      </div>

      {/* Feature Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {features.map((feature, i) => (
          <div
            key={feature.title}
            className="glass-card p-6 transition-all duration-300 hover:border-primary/30 hover:bg-card/80 animate-fade-in-up"
            style={{ animationDelay: `${(i + 1) * 100}ms` }}
          >
            <div className="mb-4 inline-flex rounded-lg bg-primary/10 p-2.5">
              <feature.icon className="h-5 w-5 text-primary" />
            </div>
            <h3 className="font-display text-lg mb-2">{feature.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {feature.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
