"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { BarChart3, Home, History, GraduationCap } from "lucide-react";

const navItems = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/markowitz", label: "Markowitz", icon: BarChart3 },
  { href: "/simulaciones", label: "Simulaciones", icon: History },
  { href: "/academia", label: "Academia", icon: GraduationCap },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r border-border/50 bg-card/40 backdrop-blur-sm flex flex-col">
      <div className="p-6 pb-8">
        <h1 className="font-display text-2xl tracking-tight">
          <span className="text-gradient-gold">Optim.</span>{" "}
          <span className="text-foreground/80">Portafolio</span>
        </h1>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {navItems.map((item) => {
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
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <item.icon className={cn("h-4 w-4", isActive && "text-primary")} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 mx-3 mb-3 rounded-lg bg-accent/50 border border-border/30">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Optimización de portafolio basada en la teoría de Markowitz
        </p>
      </div>
    </aside>
  );
}
