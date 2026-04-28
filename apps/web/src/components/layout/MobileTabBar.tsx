"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { BarChart3, Home, GraduationCap } from "lucide-react";

const navItems = [
  { href: "/", labelKey: "home", icon: Home },
  { href: "/efficient-frontier", labelKey: "efficientFrontier", icon: BarChart3 },
  { href: "/academia", labelKey: "academia", icon: GraduationCap },
] as const;

export function MobileTabBar() {
  const pathname = usePathname();
  const tNav = useTranslations("Nav");

  return (
    <nav
      className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border/50 bg-card/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
      aria-label={tNav("ariaLabel")}
    >
      <ul className="grid grid-cols-3">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <item.icon className="h-5 w-5" strokeWidth={isActive ? 2.25 : 1.75} />
                <span>{tNav(item.labelKey)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
