"use client";

import { useTranslations } from "next-intl";
import { AlertCircle } from "lucide-react";

export function SalesFinalNotice() {
  const t = useTranslations("Billing");
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200/90">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
      <p className="leading-relaxed">{t("salesFinal")}</p>
    </div>
  );
}
