"use client";

import { authClient } from "@/lib/auth-client";
import { LogIn, LogOut, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AuthModal } from "@/components/auth/AuthModal";
import { EmailVerificationBanner } from "@/components/auth/EmailVerificationBanner";
import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher";

export function Header() {
  const t = useTranslations("Header");
  const tBrand = useTranslations("Brand");
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user;

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showUserMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showUserMenu]);

  const handleSignOut = async () => {
    await authClient.signOut();
  };

  return (
    <>
      <EmailVerificationBanner />
      <header className="border-b border-border/50 bg-card/20 backdrop-blur-sm px-4 py-3 md:px-8">
        <div className="flex items-center justify-between gap-3 md:justify-end">
          <h1 className="font-display text-lg tracking-tight md:hidden">
            <span className="text-gradient-gold">{tBrand("shortName")}</span>{" "}
            <span className="text-foreground/80">{tBrand("fullName")}</span>
          </h1>
          <div className="flex items-center gap-2 md:gap-3">
            <LocaleSwitcher />
          {isPending ? (
            <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
          ) : user ? (
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setShowUserMenu((v) => !v)}
                className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-muted/60 md:gap-3 md:px-2"
                aria-haspopup="menu"
                aria-expanded={showUserMenu}
              >
                {user.image ? (
                  <img
                    src={user.image}
                    alt={user.name || t("userFallback")}
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
              </button>

              {showUserMenu && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-40 mt-2 w-56 overflow-hidden rounded-lg border border-border bg-card shadow-xl"
                >
                  <div className="border-b border-border/60 px-3 py-2.5">
                    <p className="truncate text-sm font-medium text-foreground">
                      {user.name || t("userFallback")}
                    </p>
                    {user.email && (
                      <p className="truncate text-xs text-muted-foreground">
                        {user.email}
                      </p>
                    )}
                  </div>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setShowUserMenu(false);
                      handleSignOut();
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    {t("signOut")}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setShowAuthModal(true)}
              className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-all hover:brightness-110 glow-gold md:px-4"
            >
              <LogIn className="h-4 w-4" />
              <span className="hidden sm:inline">{t("signIn")}</span>
              <span className="sm:hidden">{t("signInShort")}</span>
            </button>
          )}
          </div>
        </div>
      </header>

      <AuthModal open={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </>
  );
}
