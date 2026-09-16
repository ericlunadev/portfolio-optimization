"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { WalletCard } from "@/components/billing/WalletCard";
import { PackagePicker } from "@/components/billing/PackagePicker";
import { LedgerTable } from "@/components/billing/LedgerTable";
import { UsagePanel } from "./UsagePanel";
import { useAvailableRails } from "./queries";

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
      <div className="rounded-lg border border-emerald-600/40 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:text-emerald-200">
        {t("statusSuccess")}
      </div>
    );
  }
  if (status === "cancelled") {
    return (
      <div className="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground dark:border-border/60 dark:bg-card/30">
        {t("statusCancelled")}
      </div>
    );
  }
  return null;
}

export default function BillingPage() {
  const t = useTranslations("Billing");
  // Which rails this tenant may pay with (PLAN Task 2.7). The picker renders a
  // tab per rail; the server refuses a gated one regardless of what is shown.
  const { rails } = useAvailableRails();

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
        <PackagePicker rails={rails} />
      </section>

      {/* Owner only — the panel renders nothing for a member (PLAN Task 2.4). */}
      <UsagePanel />

      <section className="space-y-3">
        <h2 className="font-display text-xl tracking-tight">{t("ledgerTitle")}</h2>
        {/* The balance above is the organization's; this history is the reader's
            own. Said out loud, because the two not adding up is otherwise read
            as a bug rather than as the deliberate split of PLAN Task 2.4. */}
        <p className="text-sm text-muted-foreground">{t("ledgerScopeNote")}</p>
        <LedgerTable />
      </section>
    </div>
  );
}
