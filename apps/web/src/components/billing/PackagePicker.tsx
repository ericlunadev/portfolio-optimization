"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Bitcoin, CreditCard, Loader2 } from "lucide-react";
import {
  usePackages,
  useCreateCheckout,
  useCreateCryptoCheckout,
} from "@/hooks/useBilling";
import { SalesFinalNotice } from "./SalesFinalNotice";
import { formatUsdCents } from "@/lib/utils";

type Rail = "stripe" | "coinbase_commerce";

export function PackagePicker() {
  const t = useTranslations("Billing");
  const [rail, setRail] = useState<Rail>("stripe");
  const { data: packages, isLoading } = usePackages(rail);
  const fiatCheckout = useCreateCheckout();
  const cryptoCheckout = useCreateCryptoCheckout();
  const [selected, setSelected] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const checkout = rail === "stripe" ? fiatCheckout : cryptoCheckout;

  const handleRailChange = (next: Rail) => {
    if (next === rail) return;
    setRail(next);
    setSelected(null);
    setErrorMessage(null);
  };

  const handleBuy = async () => {
    if (!selected) return;
    setErrorMessage(null);
    try {
      const { url } = await checkout.mutateAsync(selected);
      window.location.href = url;
    } catch (err) {
      console.error(err);
      setErrorMessage(t("errorCheckout"));
    }
  };

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label={t("railTabsAria")}
        className="inline-flex rounded-lg border border-border/60 bg-card/30 p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={rail === "stripe"}
          onClick={() => handleRailChange("stripe")}
          className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
            rail === "stripe"
              ? "bg-primary/10 text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <CreditCard className="h-4 w-4" />
          {t("railCard")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={rail === "coinbase_commerce"}
          onClick={() => handleRailChange("coinbase_commerce")}
          className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
            rail === "coinbase_commerce"
              ? "bg-primary/10 text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Bitcoin className="h-4 w-4" />
          {t("railCrypto")}
        </button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">{t("loadingPackages")}</div>
      ) : !packages?.length ? (
        <div className="rounded-lg border border-border/60 bg-card/30 p-4 text-sm text-muted-foreground">
          {t("noPackages")}
        </div>
      ) : (
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
                  {pkg.credits}{" "}
                  <span className="text-sm text-muted-foreground">{t("creditsUnit")}</span>
                </div>
                <div className="mt-1 text-sm text-foreground/80">{formatUsdCents(pkg.priceMinor)}</div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {t("perCreditCost", {
                    cost: ((pkg.priceMinor / 100) / pkg.credits).toFixed(2),
                  })}
                </div>
              </button>
            );
          })}
        </div>
      )}

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

      <p className="text-xs text-muted-foreground">
        {rail === "stripe" ? t("usdOnlyNote") : t("cryptoNote")}
      </p>

      <button
        type="button"
        onClick={handleBuy}
        disabled={!selected || !acknowledged || checkout.isPending}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {checkout.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : rail === "stripe" ? (
          <CreditCard className="h-4 w-4" />
        ) : (
          <Bitcoin className="h-4 w-4" />
        )}
        {rail === "stripe" ? t("buyButton") : t("buyButtonCrypto")}
      </button>

      {errorMessage && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
