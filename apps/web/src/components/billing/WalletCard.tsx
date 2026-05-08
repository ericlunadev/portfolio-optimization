"use client";

import { useTranslations } from "next-intl";
import { Wallet } from "lucide-react";
import { useWallet } from "@/hooks/useBilling";

export function WalletCard() {
  const t = useTranslations("Billing");
  const { data, isLoading } = useWallet();

  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-6 backdrop-blur-sm">
      <div className="flex items-center gap-3 text-muted-foreground">
        <Wallet className="h-4 w-4" />
        <span className="text-sm font-medium uppercase tracking-wide">{t("walletLabel")}</span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-display text-5xl tracking-tight text-foreground">
          {isLoading ? "…" : data?.credits ?? 0}
        </span>
        <span className="text-sm text-muted-foreground">{t("creditsUnit")}</span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{t("walletHint")}</p>
    </div>
  );
}
