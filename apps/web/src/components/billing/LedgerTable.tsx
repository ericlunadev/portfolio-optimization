"use client";

import { useTranslations } from "next-intl";
import { useLedger } from "@/hooks/useBilling";
import type { LedgerEntry } from "@/lib/api";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export function LedgerTable() {
  const t = useTranslations("Billing");
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useLedger();

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">{t("loadingLedger")}</div>;
  }

  const rows: LedgerEntry[] = data?.pages.flatMap((p) => p.items) ?? [];

  if (!rows.length) {
    return (
      <div className="rounded-lg border border-border/60 bg-card/30 p-6 text-center text-sm text-muted-foreground">
        {t("emptyLedger")}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-border/60 bg-card/30">
        <table className="w-full text-sm">
          <thead className="bg-card/60 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">{t("colDate")}</th>
              <th className="px-4 py-2.5 text-left font-medium">{t("colType")}</th>
              <th className="px-4 py-2.5 text-right font-medium">{t("colDelta")}</th>
              <th className="px-4 py-2.5 text-right font-medium">{t("colBalanceAfter")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border/30">
                <td className="px-4 py-2.5 text-foreground/80">{formatDate(r.createdAt)}</td>
                <td className="px-4 py-2.5 text-foreground/80">{t(`reason.${r.reason}`)}</td>
                <td className={`px-4 py-2.5 text-right font-mono ${r.delta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {r.delta >= 0 ? `+${r.delta}` : r.delta}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-foreground/80">{r.balanceAfter}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasNextPage && (
        <button
          type="button"
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="w-full rounded-lg border border-border/60 bg-card/30 px-4 py-2 text-sm text-muted-foreground hover:bg-card/60"
        >
          {isFetchingNextPage ? t("loadingMore") : t("loadMore")}
        </button>
      )}
    </div>
  );
}
