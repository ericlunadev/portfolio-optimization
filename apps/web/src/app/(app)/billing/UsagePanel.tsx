"use client";

import { useTranslations } from "next-intl";
import { Users } from "lucide-react";
import { useUsage } from "./queries";
import {
  actorKey,
  formatDelta,
  formatUsageDate,
  memberName,
  unattributedKey,
  type UsageMember,
} from "./usage";

// PLAN Task 2.4 — the owner's view of one shared wallet.
//
// Only an owner can read `GET /api/billing/usage`; every member gets a 403.
// That refusal is the answer, not a failure worth reporting, so the whole
// section disappears rather than showing an error a member cannot act on. The
// server is the authority here — this component asks and renders what it gets.

function MemberLabel({ member }: { member: UsageMember }) {
  const t = useTranslations("Billing");
  const name = memberName(member);

  if (name) {
    return (
      <span className={member.isCurrentMember ? "text-foreground/80" : "text-muted-foreground"}>
        {name}
      </span>
    );
  }

  // No name at all: the rows that belong to no seat — an operator grant, or an
  // analyst whose account was deleted out from under their spending.
  return <span className="text-muted-foreground italic">{t(unattributedKey(member))}</span>;
}

export function UsagePanel() {
  const t = useTranslations("Billing");
  const { data, isLoading, isError } = useUsage();

  if (isError) return null;

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">{t("usageLoading")}</p>;
  }

  if (!data) return null;

  const { totals, members, recent } = data;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 font-display text-xl tracking-tight">
          <Users className="h-4 w-4 text-muted-foreground" />
          {t("usageTitle")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("usageSubtitle")}</p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-4">
        {[
          { label: t("usageTotalSpent"), value: totals.spent },
          { label: t("usageTotalAdded"), value: totals.added },
          { label: t("usageTotalRuns"), value: totals.runs },
          { label: t("usageSeats"), value: totals.seats },
        ].map((tile) => (
          <div
            key={tile.label}
            className="rounded-xl border border-border bg-card p-4 dark:border-border/60 dark:bg-card/40"
          >
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{tile.label}</dt>
            <dd className="mt-1 font-display text-2xl tracking-tight">{tile.value}</dd>
          </div>
        ))}
      </dl>

      {members.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground dark:border-border/60 dark:bg-card/30">
          {t("usageEmpty")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card dark:border-border/60 dark:bg-card/30">
          <table className="w-full text-sm">
            <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground dark:bg-card/60">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">{t("usageColMember")}</th>
                <th className="px-4 py-2.5 text-right font-medium">{t("usageColSpent")}</th>
                <th className="px-4 py-2.5 text-right font-medium">{t("usageColRuns")}</th>
                <th className="px-4 py-2.5 text-right font-medium">{t("usageColSimulations")}</th>
                <th className="px-4 py-2.5 text-right font-medium">{t("usageColLastActivity")}</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr
                  key={member.userId ?? "unattributed"}
                  className="border-t border-border dark:border-border/30"
                >
                  <td className="px-4 py-2.5">
                    <MemberLabel member={member} />
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-foreground/80">
                    {member.spent}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-foreground/80">
                    {member.runs}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-foreground/80">
                    {member.simulations}
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">
                    {formatUsageDate(member.lastActivityAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {recent.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-display text-lg tracking-tight">{t("usageActivityTitle")}</h3>
          <div className="overflow-x-auto rounded-xl border border-border bg-card dark:border-border/60 dark:bg-card/30">
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground dark:bg-card/60">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">{t("colDate")}</th>
                  <th className="px-4 py-2.5 text-left font-medium">{t("usageColActor")}</th>
                  <th className="px-4 py-2.5 text-left font-medium">{t("colType")}</th>
                  <th className="px-4 py-2.5 text-right font-medium">{t("colDelta")}</th>
                  <th className="px-4 py-2.5 text-right font-medium">{t("colBalanceAfter")}</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((row) => {
                  const fallbackKey = actorKey(row);
                  return (
                    <tr key={row.id} className="border-t border-border dark:border-border/30">
                      <td className="px-4 py-2.5 text-foreground/80">
                        {formatUsageDate(row.createdAt)}
                      </td>
                      <td className="px-4 py-2.5">
                        {fallbackKey ? (
                          <span className="text-muted-foreground italic">{t(fallbackKey)}</span>
                        ) : (
                          <span className="text-foreground/80">{row.actor?.name}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-foreground/80">{t(`reason.${row.reason}`)}</td>
                      <td
                        className={`px-4 py-2.5 text-right font-mono ${
                          row.delta >= 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-rose-600 dark:text-rose-400"
                        }`}
                      >
                        {formatDelta(row.delta)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-foreground/80">
                        {row.balanceAfter}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
