"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Languages } from "lucide-react";
import { locales, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

export function LocaleSwitcher() {
  const t = useTranslations("LocaleSwitcher");
  const currentLocale = useLocale() as Locale;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const setLocale = (locale: Locale) => {
    if (locale === currentLocale || isPending) return;
    startTransition(async () => {
      await fetch("/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      router.refresh();
    });
  };

  return (
    <div
      role="group"
      aria-label={t("label")}
      className="flex items-center gap-1 rounded-lg border border-border/60 bg-card/40 p-0.5"
    >
      <Languages className="ml-1.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      {locales.map((locale) => {
        const isActive = locale === currentLocale;
        return (
          <button
            key={locale}
            type="button"
            onClick={() => setLocale(locale)}
            disabled={isPending}
            aria-pressed={isActive}
            className={cn(
              "rounded-md px-2 py-1 text-xs font-medium uppercase tracking-wide transition-colors",
              isActive
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground",
              isPending && "opacity-60",
            )}
          >
            {locale}
          </button>
        );
      })}
    </div>
  );
}
