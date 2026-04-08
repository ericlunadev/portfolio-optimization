"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { LogIn, User } from "lucide-react";

export function Header() {
  const { data: user, isLoading } = useQuery({
    queryKey: ["user"],
    queryFn: api.getCurrentUser,
    retry: false,
  });

  return (
    <header className="border-b border-border/50 bg-card/20 backdrop-blur-sm px-8 py-3">
      <div className="flex items-center justify-end">
        {isLoading ? (
          <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
        ) : user ? (
          <div className="flex items-center gap-3">
            {user.picture_url ? (
              <img
                src={user.picture_url}
                alt={user.name || "Usuario"}
                className="h-8 w-8 rounded-full ring-2 ring-primary/20"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary ring-2 ring-primary/20">
                <User className="h-4 w-4" />
              </div>
            )}
            <span className="text-sm font-medium text-foreground/80">
              {user.name || user.email}
            </span>
          </div>
        ) : (
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL || ""}/api/auth/login/google`}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:brightness-110 glow-gold"
          >
            <LogIn className="h-4 w-4" />
            Iniciar Sesión
          </a>
        )}
      </div>
    </header>
  );
}
