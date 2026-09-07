"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useTenantBrand } from "@/components/tenant/TenantProvider";
import { useOrgSettings } from "@/hooks/useOrgSettings";
import { isNavHrefVisible } from "@/lib/org-settings";
import { BarChart3, Home, GraduationCap, Wallet } from "lucide-react";

// Kept identical to `MobileTabBar`'s list, per CLAUDE.md. Which of them a given
// tenant actually sees is decided by `isNavHrefVisible`, shared by both.
const navItems = [
  { href: "/", labelKey: "home", icon: Home },
  { href: "/efficient-frontier", labelKey: "efficientFrontier", icon: BarChart3 },
  { href: "/academia", labelKey: "academia", icon: GraduationCap },
  { href: "/billing", labelKey: "billing", icon: Wallet },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const tNav = useTranslations("Nav");
  const brand = useTenantBrand();
  const { settings } = useOrgSettings();
  const visibleItems = navItems.filter((item) =>
    isNavHrefVisible(item.href, settings)
  );

  return (
    <aside className="hidden md:flex w-64 shrink-0 border-r border-border bg-card/80 dark:border-border/50 dark:bg-card/40 backdrop-blur-sm flex-col">
      <div className="p-6 pb-8">
        <h1 className="font-display text-2xl tracking-tight">
          {brand.shortName && (
            <>
              <span className="text-gradient-gold">{brand.shortName}</span>{" "}
            </>
          )}
          <span className="text-foreground/80">{brand.fullName}</span>
        </h1>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {visibleItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-primary/15 text-primary border border-primary/30 dark:bg-primary/10 dark:border-primary/20"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <item.icon className={cn("h-4 w-4", isActive && "text-primary")} />
              {tNav(item.labelKey)}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
