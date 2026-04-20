"use client";

import { authClient } from "@/lib/auth-client";
import { LogIn, LogOut, User } from "lucide-react";

export function Header() {
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user;

  const handleSignIn = async () => {
    await authClient.signIn.social({
      provider: "google",
      callbackURL: window.location.origin,
    });
  };

  const handleSignOut = async () => {
    await authClient.signOut();
  };

  return (
    <header className="border-b border-border/50 bg-card/20 backdrop-blur-sm px-8 py-3">
      <div className="flex items-center justify-end">
        {isPending ? (
          <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
        ) : user ? (
          <div className="flex items-center gap-3">
            {user.image ? (
              <img
                src={user.image}
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
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" />
              Salir
            </button>
          </div>
        ) : (
          <button
            onClick={handleSignIn}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:brightness-110 glow-gold"
          >
            <LogIn className="h-4 w-4" />
            Iniciar Sesión
          </button>
        )}
      </div>
    </header>
  );
}
