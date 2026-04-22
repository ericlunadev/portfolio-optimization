"use client";

import { authClient } from "@/lib/auth-client";
import { LogIn, LogOut, User, X } from "lucide-react";
import { useState } from "react";

export function Header() {
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user;

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setName("");
    setError("");
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isSignUp) {
        const { error } = await authClient.signUp.email({
          email,
          password,
          name,
        });
        if (error) {
          setError(error.message || "Error al crear la cuenta");
          setLoading(false);
          return;
        }
      } else {
        const { error } = await authClient.signIn.email({
          email,
          password,
        });
        if (error) {
          setError(error.message || "Credenciales inválidas");
          setLoading(false);
          return;
        }
      }
      resetForm();
      setShowAuthModal(false);
    } catch {
      setError("Error inesperado. Intente de nuevo.");
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await authClient.signOut();
  };

  return (
    <>
      <header className="border-b border-border/50 bg-card/20 backdrop-blur-sm px-4 py-3 md:px-8">
        <div className="flex items-center justify-between gap-3 md:justify-end">
          <h1 className="font-display text-lg tracking-tight md:hidden">
            <span className="text-gradient-gold">Optim.</span>{" "}
            <span className="text-foreground/80">Portafolio</span>
          </h1>
          {isPending ? (
            <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
          ) : user ? (
            <div className="flex items-center gap-2 md:gap-3">
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
              <span className="hidden max-w-[12rem] truncate text-sm font-medium text-foreground/80 sm:inline">
                {user.name || user.email}
              </span>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:px-3"
                aria-label="Cerrar sesión"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Salir</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                resetForm();
                setIsSignUp(false);
                setShowAuthModal(true);
              }}
              className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-all hover:brightness-110 glow-gold md:px-4"
            >
              <LogIn className="h-4 w-4" />
              <span className="hidden sm:inline">Iniciar Sesión</span>
              <span className="sm:hidden">Entrar</span>
            </button>
          )}
        </div>
      </header>

      {showAuthModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setShowAuthModal(false)}
        >
          <div
            className="relative w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-2xl md:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowAuthModal(false)}
              className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>

            <h2 className="mb-4 text-lg font-semibold text-foreground">
              {isSignUp ? "Crear Cuenta" : "Iniciar Sesión"}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-3">
              {isSignUp && (
                <input
                  type="text"
                  placeholder="Nombre"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              )}
              <input
                type="email"
                placeholder="Correo electrónico"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <input
                type="password"
                placeholder="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />

              {error && (
                <p className="text-sm text-red-400">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:brightness-110 disabled:opacity-50 glow-gold"
              >
                {loading
                  ? "Cargando..."
                  : isSignUp
                    ? "Crear Cuenta"
                    : "Iniciar Sesión"}
              </button>
            </form>

            <p className="mt-4 text-center text-sm text-muted-foreground">
              {isSignUp ? "¿Ya tienes cuenta?" : "¿No tienes cuenta?"}{" "}
              <button
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError("");
                }}
                className="text-primary hover:underline"
              >
                {isSignUp ? "Iniciar Sesión" : "Crear Cuenta"}
              </button>
            </p>
          </div>
        </div>
      )}
    </>
  );
}
