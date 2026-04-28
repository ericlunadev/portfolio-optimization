"use client";

import { useState } from "react";
import { LogIn, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { AuthModal } from "@/components/auth/AuthModal";

interface SignInPromptProps {
  title?: string;
  description?: string;
}

export function SignInPrompt({
  title,
  description,
}: SignInPromptProps) {
  const t = useTranslations("Auth");
  const effectiveTitle = title ?? t("promptTitle");
  const effectiveDescription = description ?? t("promptDescription");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [initialMode, setInitialMode] = useState<"signin" | "signup">("signin");

  return (
    <>
      <div className="mx-auto max-w-md">
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/50 bg-card/30 px-6 py-12 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Lock className="h-5 w-5" />
          </div>
          <h2 className="font-display text-xl tracking-tight">{effectiveTitle}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{effectiveDescription}</p>
          <div className="mt-6 flex flex-col items-stretch gap-2 sm:flex-row">
            <button
              onClick={() => {
                setInitialMode("signin");
                setShowAuthModal(true);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 glow-gold"
            >
              <LogIn className="h-4 w-4" />
              {t("signIn")}
            </button>
            <button
              onClick={() => {
                setInitialMode("signup");
                setShowAuthModal(true);
              }}
              className="inline-flex items-center justify-center rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
            >
              {t("createAccount")}
            </button>
          </div>
        </div>
      </div>

      <AuthModal
        open={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        initialMode={initialMode}
      />
    </>
  );
}
