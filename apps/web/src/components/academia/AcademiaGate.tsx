"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useOrgSettings } from "@/hooks/useOrgSettings";

/**
 * Renders the Academia route only for organizations that have it switched on
 * (`organization_settings.academia_enabled`, PLAN Task 3.2). The nav entries are
 * filtered by the same setting, so reaching this state means the URL was typed
 * or bookmarked.
 *
 * The route waits for the setting rather than assuming it, unlike the nav: the
 * page is a heavy render, and flashing an entire product surface a tenant has
 * turned off is worse than a blank moment. PLAN Phase 1 moves the switch into
 * the tenant config the root layout already resolves, which removes the wait.
 */
export function AcademiaGate({ children }: { children: React.ReactNode }) {
  const t = useTranslations("Academia.Unavailable");
  const { settings, isLoading } = useOrgSettings();

  if (isLoading) return null;

  if (!settings.academiaEnabled) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="font-display text-2xl tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("body")}</p>
        <Link
          href="/"
          className="mt-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:brightness-110"
        >
          {t("back")}
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
