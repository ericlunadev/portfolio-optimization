import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";

/**
 * Full investing disclaimer. The short notices shown across the app (results,
 * advisor booking, onboarding, PDF, email) all point here.
 *
 * The copy is drafted to cover how the product actually works; it has not been
 * reviewed by counsel. Wording is jurisdiction-sensitive — MX (CNBV) and US
 * (SEC) differ on what counts as "asesoría de inversiones" — so have it
 * reviewed before relying on it.
 */
const LAST_UPDATED = "26/08/2026";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Legal.page");
  return { title: t("title") };
}

export default async function LegalPage() {
  const t = await getTranslations("Legal.page");

  const sections = [
    { title: t("noAdviceTitle"), body: t("noAdviceBody") },
    { title: t("pastPerformanceTitle"), body: t("pastPerformanceBody") },
    { title: t("modelLimitsTitle"), body: t("modelLimitsBody") },
    { title: t("dataSourcesTitle"), body: t("dataSourcesBody") },
    { title: t("advisoryTitle"), body: t("advisoryBody") },
    { title: t("creditsTitle"), body: t("creditsBody") },
    { title: t("jurisdictionTitle"), body: t("jurisdictionBody") },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 md:px-8 md:py-16">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("backToApp")}
      </Link>

      <header className="mt-8 space-y-3">
        <h1 className="font-display text-3xl tracking-tight md:text-4xl">
          {t("title")}
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground">
          {t("intro")}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("lastUpdated", { date: LAST_UPDATED })}
        </p>
      </header>

      <div className="mt-10 space-y-8">
        {sections.map((section) => (
          <section key={section.title} className="space-y-2">
            <h2 className="font-display text-lg tracking-tight">{section.title}</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {section.body}
            </p>
          </section>
        ))}
      </div>
    </div>
  );
}
