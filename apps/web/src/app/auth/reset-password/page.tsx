"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const t = useTranslations("Auth");
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success">(
    "idle"
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError(t("resetPasswordMismatch"));
      return;
    }
    setError("");
    setStatus("submitting");
    try {
      const { error: apiError } = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (apiError) {
        setError(t("resetPasswordError"));
        setStatus("idle");
        return;
      }
      setStatus("success");
      setTimeout(() => router.push("/"), 1800);
    } catch {
      setError(t("resetPasswordError"));
      setStatus("idle");
    }
  };

  return (
    <main className="flex min-h-[80vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl">
        <h1 className="mb-2 text-lg font-semibold text-foreground">
          {t("resetPasswordTitle")}
        </h1>

        {!token ? (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            {t("resetPasswordInvalidToken")}
          </p>
        ) : status === "success" ? (
          <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
            {t("resetPasswordSuccess")}
          </p>
        ) : (
          <>
            <p className="mb-5 text-sm text-muted-foreground">
              {t("resetPasswordDescription")}
            </p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="password"
                placeholder={t("resetPasswordNewPlaceholder")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <input
                type="password"
                placeholder={t("resetPasswordConfirmPlaceholder")}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              {error && <p className="text-sm text-red-400">{error}</p>}
              <button
                type="submit"
                disabled={status === "submitting"}
                className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:brightness-110 disabled:opacity-50 glow-gold"
              >
                {status === "submitting"
                  ? t("loading")
                  : t("resetPasswordSubmit")}
              </button>
            </form>
          </>
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
