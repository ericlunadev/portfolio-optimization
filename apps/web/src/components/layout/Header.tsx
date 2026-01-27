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
    <header className="border-b border-border bg-card px-6 py-3">
      <div className="flex items-center justify-end">
        {isLoading ? (
          <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
        ) : user ? (
          <div className="flex items-center gap-2">
            {user.picture_url ? (
              <img
                src={user.picture_url}
                alt={user.name || "Usuario"}
                className="h-8 w-8 rounded-full"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <User className="h-4 w-4" />
              </div>
            )}
            <span className="text-sm font-medium">{user.name || user.email}</span>
          </div>
        ) : (
          <a
            href="/api/auth/login/google"
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <LogIn className="h-4 w-4" />
            Iniciar Sesión
          </a>
        )}
      </div>
    </header>
  );
}
