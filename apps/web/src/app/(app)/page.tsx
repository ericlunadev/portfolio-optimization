import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BarChart3, TrendingUp, Shield, Zap } from "lucide-react";
import { WelcomeCard } from "@/components/academia/WelcomeCard";

export default async function Home() {
  const t = await getTranslations("HomePage");

  const features = [
    {
      icon: BarChart3,
      title: t("feature1Title"),
      description: t("feature1Description"),
    },
    {
      icon: TrendingUp,
      title: t("feature2Title"),
      description: t("feature2Description"),
    },
    {
      icon: Shield,
      title: t("feature3Title"),
      description: t("feature3Description"),
    },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-10">
      <WelcomeCard />

      <div className="space-y-5 pt-2 animate-fade-in-up md:space-y-6 md:pt-4">
        <h1 className="font-display text-4xl md:text-6xl tracking-tight leading-[1.1]">
          {t("heroTitleStart")}{" "}
          <span className="text-gradient-gold">{t("heroTitleHighlight")}</span>
        </h1>
        <p className="text-base md:text-lg text-muted-foreground max-w-2xl leading-relaxed">
          {t("heroDescription")}
        </p>
        <Link
          href="/efficient-frontier/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 glow-gold"
        >
          <Zap className="h-4 w-4" />
          {t("ctaStart")}
        </Link>
      </div>

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
