"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailInner />
    </Suspense>
  );
}

type Status = "verifying" | "success" | "error" | "missing";

function VerifyEmailInner() {
  const t = useTranslations("Auth");
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [status, setStatus] = useState<Status>(
    token ? "verifying" : "missing"
  );
  const ranRef = useRef(false);

  useEffect(() => {
    if (!token || ranRef.current) return;
    ranRef.current = true;
    (async () => {
      try {
        const result = await authClient.verifyEmail({ query: { token } });
        setStatus(result.error ? "error" : "success");
      } catch {
        setStatus("error");
      }
    })();
  }, [token]);

  return (
    <main className="flex min-h-[80vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 text-center shadow-2xl">
        <h1 className="mb-4 text-lg font-semibold text-foreground">
          {t("verifyEmailTitle")}
        </h1>

        {status === "verifying" && (
          <p className="text-sm text-muted-foreground">
            {t("verifyEmailVerifying")}
          </p>
        )}

        {status === "success" && (
          <>
            <p className="mb-5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
              {t("verifyEmailSuccess")}
            </p>
            <Link
              href="/"
              className="inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:brightness-110 glow-gold"
            >
              {t("verifyEmailGoToApp")}
            </Link>
          </>
        )}

        {status === "missing" && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            {t("verifyEmailMissingToken")}
          </p>
        )}

        {status === "error" && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            {t("verifyEmailError")}
          </p>
        )}
      </div>
    </main>
  );
}
