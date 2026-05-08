"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CreditCard, Loader2 } from "lucide-react";
import { usePackages, useCreateCheckout } from "@/hooks/useBilling";
import { ApiError } from "@/lib/api";
import { SalesFinalNotice } from "./SalesFinalNotice";

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)} USD`;
}

export function PackagePicker() {
  const t = useTranslations("Billing");
  const { data: packages, isLoading } = usePackages("stripe");
  const checkout = useCreateCheckout();
  const [selected, setSelected] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">{t("loadingPackages")}</div>;
  }
  if (!packages?.length) {
    return (
      <div className="rounded-lg border border-border/60 bg-card/30 p-4 text-sm text-muted-foreground">
        {t("noPackages")}
      </div>
    );
  }

  const handleBuy = async () => {
    if (!selected) return;
    setErrorMessage(null);
    try {
      const { url } = await checkout.mutateAsync(selected);
      window.location.href = url;
    } catch (err) {
      console.error(err);
      if (err instanceof ApiError && err.code === "EMAIL_NOT_VERIFIED") {
        setErrorMessage(t("errorEmailNotVerified"));
      } else {
        setErrorMessage(t("errorCheckout"));
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {packages.map((pkg) => {
          const isSel = selected === pkg.id;
          return (
            <button
              key={pkg.id}
              type="button"
              onClick={() => setSelected(pkg.id)}
              className={`text-left rounded-xl border p-4 transition-all ${
                isSel
                  ? "border-primary/60 bg-primary/5 ring-2 ring-primary/30"
                  : "border-border/60 bg-card/40 hover:border-border"
              }`}
            >
              <div className="font-display text-2xl tracking-tight">
                {pkg.credits} <span className="text-sm text-muted-foreground">{t("creditsUnit")}</span>
              </div>
              <div className="mt-1 text-sm text-foreground/80">{formatUsd(pkg.priceMinor)}</div>
              <div className="mt-2 text-xs text-muted-foreground">
                {t("perCreditCost", {
                  cost: ((pkg.priceMinor / 100) / pkg.credits).toFixed(2),
                })}
              </div>
            </button>
          );
        })}
      </div>

      <SalesFinalNotice />

      <label className="flex items-start gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-border bg-card"
        />
        <span>{t("salesFinalAck")}</span>
      </label>

      <p className="text-xs text-muted-foreground">{t("usdOnlyNote")}</p>

      <button
        type="button"
        onClick={handleBuy}
        disabled={!selected || !acknowledged || checkout.isPending}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {checkout.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CreditCard className="h-4 w-4" />
        )}
        {t("buyButton")}
      </button>

      {errorMessage && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
