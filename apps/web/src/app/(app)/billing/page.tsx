"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { WalletCard } from "@/components/billing/WalletCard";
import { PackagePicker } from "@/components/billing/PackagePicker";
import { LedgerTable } from "@/components/billing/LedgerTable";

function StatusBanner() {
  const t = useTranslations("Billing");
  const params = useSearchParams();
  const status = params.get("status");
  const queryClient = useQueryClient();

  // Stripe redirects back with ?status=success after checkout. Webhook may
  // arrive a beat later, so just refetch — the wallet card will catch up.
  useEffect(() => {
    if (status === "success") {
      queryClient.invalidateQueries({ queryKey: ["billing"] });
    }
  }, [status, queryClient]);

  if (status === "success") {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
        {t("statusSuccess")}
      </div>
    );
  }
  if (status === "cancelled") {
    return (
      <div className="rounded-lg border border-border/60 bg-card/30 p-3 text-sm text-muted-foreground">
        {t("statusCancelled")}
      </div>
    );
  }
  return null;
}

export default function BillingPage() {
  const t = useTranslations("Billing");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="font-display text-3xl tracking-tight">{t("pageTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("pageSubtitle")}</p>
      </header>

      <Suspense fallback={null}>
        <StatusBanner />
      </Suspense>

      <WalletCard />

      <section className="space-y-3">
        <h2 className="font-display text-xl tracking-tight">{t("buyTitle")}</h2>
        <PackagePicker />
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl tracking-tight">{t("ledgerTitle")}</h2>
        <LedgerTable />
      </section>
    </div>
  );
}
