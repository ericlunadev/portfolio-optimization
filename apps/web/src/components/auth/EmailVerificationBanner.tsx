"use client";

import { useState } from "react";
import { MailWarning } from "lucide-react";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";

type ResendStatus = "idle" | "sending" | "sent" | "error";

export function EmailVerificationBanner() {
  const t = useTranslations("Auth");
  const { data: session } = authClient.useSession();
  const [status, setStatus] = useState<ResendStatus>("idle");

  const user = session?.user;
  if (!user || user.emailVerified) return null;

  const handleResend = async () => {
    setStatus("sending");
    try {
      const { error } = await authClient.sendVerificationEmail({
        email: user.email,
        callbackURL: "/auth/verify-email",
      });
      setStatus(error ? "error" : "sent");
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200 md:px-8">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MailWarning className="h-4 w-4 shrink-0" />
          <span>
            {status === "sent"
              ? t("verifyBannerResent")
              : status === "error"
                ? t("verifyBannerError")
                : t("verifyBannerDescription")}
          </span>
        </div>
        {status !== "sent" && (
          <button
            onClick={handleResend}
            disabled={status === "sending"}
            className="shrink-0 rounded-md border border-amber-400/40 px-2.5 py-1 text-xs font-medium text-amber-100 transition-colors hover:bg-amber-400/10 disabled:opacity-50"
          >
            {status === "sending"
              ? t("verifyBannerResending")
              : t("verifyBannerResend")}
          </button>
        )}
      </div>
    </div>
  );
}
