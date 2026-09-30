"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { CalendarClock } from "lucide-react";
import { useSimulationRuns } from "@/hooks/useSchedules";
import { formatDateDMY, formatMonthEndDMY, runDeltas } from "@/lib/schedules";
import { cn, formatNumber, formatPercent } from "@/lib/utils";

interface RunHistoryProps {
  simulationId: string;
}

/**
 * Past runs of a simulation, newest first, with each metric's move against the
 * previous successful run. Only renders the table once there is history.
 */
export function RunHistory({ simulationId }: RunHistoryProps) {
  const t = useTranslations("Schedules");
  const { data: runs } = useSimulationRuns(simulationId);

  const scheduleLink = (
    <Link
      href={`/schedules?simulation=${encodeURIComponent(simulationId)}`}
      className="inline-flex items-center gap-1.5 text-sm text-primary underline-offset-2 hover:underline"
    >
      <CalendarClock className="h-4 w-4" aria-hidden />
      {t("scheduleThis")}
    </Link>
  );

  if (!runs || runs.length === 0) {
    return <div className="flex justify-end">{scheduleLink}</div>;
  }

  const deltas = runDeltas(runs);

  return (
    <section className="rounded-xl border border-border bg-card p-4 dark:border-border/50 dark:bg-card/40 md:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg tracking-tight">{t("historyTitle")}</h2>
        {scheduleLink}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-medium">{t("historyDate")}</th>
              <th className="py-2 pr-3 font-medium">{t("historyPeriodEnd")}</th>
              <th className="py-2 pr-3 text-right font-medium">{t("historyReturn")}</th>
              <th className="py-2 pr-3 text-right font-medium">{t("historyVolatility")}</th>
              <th className="py-2 text-right font-medium">{t("historySharpe")}</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run, i) => {
              const delta = deltas[i];
              const failed = run.status !== "success";
              return (
                <tr
                  key={run.id}
                  className={cn(
                    "border-b border-border/40 last:border-0",
                    failed && "text-muted-foreground"
                  )}
                >
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {formatDateDMY(run.createdAt)}
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      {run.scheduleId ? t("historyScheduled") : t("historyManual")}
                    </span>
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {run.dateRange
                      ? formatMonthEndDMY(run.dateRange.endMonth, run.dateRange.endYear)
                      : "—"}
                  </td>
                  {failed ? (
                    <td colSpan={3} className="py-2 text-right text-xs">
                      {t("historyFailed")}
                    </td>
                  ) : (
                    <>
                      <MetricCell
                        value={run.expectedReturn}
                        delta={delta?.expectedReturn ?? null}
                        format={(v) => formatPercent(v)}
                        higherIsBetter
                      />
                      <MetricCell
                        value={run.volatility}
                        delta={delta?.volatility ?? null}
                        format={(v) => formatPercent(v)}
                        higherIsBetter={false}
                      />
                      <MetricCell
                        value={run.sharpeRatio}
                        delta={delta?.sharpeRatio ?? null}
                        format={(v) => formatNumber(v, 2)}
                        higherIsBetter
                        last
                      />
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MetricCell({
  value,
  delta,
  format,
  higherIsBetter,
  last = false,
}: {
  value: number | null;
  delta: number | null;
  format: (v: number) => string;
  /** Volatility rising is a loss, so its colours are inverted. */
  higherIsBetter: boolean;
  last?: boolean;
}) {
  const moved = delta !== null && Math.abs(delta) >= 1e-6;
  const good = moved && (delta > 0) === higherIsBetter;

  return (
    <td className={cn("py-2 text-right whitespace-nowrap tabular-nums", !last && "pr-3")}>
      <span className="font-medium">{value === null ? "—" : format(value)}</span>
      {moved && (
        <span
          className={cn(
            "ml-1.5 text-xs",
            good
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-rose-600 dark:text-rose-400"
          )}
        >
          {delta > 0 ? "+" : "−"}
          {format(Math.abs(delta))}
        </span>
      )}
    </td>
  );
}
