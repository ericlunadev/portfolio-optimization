"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const t = useTranslations("Auth");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    try {
      const { error } = await authClient.requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
      setStatus(error ? "error" : "sent");
    } catch {
      setStatus("error");
    }
  };

  return (
    <main className="flex min-h-[80vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl">
        <h1 className="mb-2 text-lg font-semibold text-foreground">
          {t("forgotPasswordTitle")}
        </h1>
        <p className="mb-5 text-sm text-muted-foreground">
          {t("forgotPasswordDescription")}
        </p>

        {status === "sent" ? (
          <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
            {t("forgotPasswordSent")}
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              placeholder={t("emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            {status === "error" && (
              <p className="text-sm text-red-400">{t("forgotPasswordError")}</p>
            )}
            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:brightness-110 disabled:opacity-50 glow-gold"
            >
              {status === "sending"
                ? t("loading")
                : t("forgotPasswordSubmit")}
            </button>
          </form>
        )}

        <p className="mt-4 text-center text-sm">
          <Link href="/" className="text-primary hover:underline">
            {t("backToSignIn")}
          </Link>
        </p>
      </div>
    </main>
  );
}
