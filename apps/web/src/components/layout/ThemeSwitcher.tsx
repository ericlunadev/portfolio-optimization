"use client";

import { useTranslations } from "next-intl";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme/ThemeProvider";
import { themes, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const ICONS: Record<Theme, typeof Sun> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

export function ThemeSwitcher({ className }: { className?: string }) {
  const t = useTranslations("ThemeSwitcher");
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="group"
      aria-label={t("label")}
      className={cn(
        "flex items-center gap-0.5 rounded-lg border border-border bg-card dark:border-border/60 dark:bg-card/40 p-0.5",
        className,
      )}
    >
      {themes.map((option) => {
        const Icon = ICONS[option];
        const isActive = option === theme;
        return (
          <button
            key={option}
            type="button"
            onClick={() => setTheme(option)}
            aria-pressed={isActive}
            title={t(option)}
            className={cn(
              "rounded-md p-1.5 transition-colors",
              isActive
                ? "bg-primary/20 text-primary dark:bg-primary/15"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">{t(option)}</span>
          </button>
        );
      })}
    </div>
  );
}
