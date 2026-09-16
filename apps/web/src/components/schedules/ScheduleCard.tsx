"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertTriangle, Loader2, Pause, Play, Trash2 } from "lucide-react";
import type { SimulationSchedule } from "@/lib/api";
import { CREDIT_FAILURES_TO_PAUSE, formatDateDMY } from "@/lib/schedules";
import { cn } from "@/lib/utils";
import { simulationDisplayName } from "./ScheduleForm";

interface ScheduleCardProps {
  schedule: SimulationSchedule;
  onToggleActive: () => void;
  isToggling: boolean;
  onDelete: () => void;
  isConfirmingDelete: boolean;
  isDeleting: boolean;
}

type Status = "active" | "paused" | "pausedCredits";

function statusOf(schedule: SimulationSchedule): Status {
  if (schedule.active) return "active";
  return schedule.consecutiveFailures >= CREDIT_FAILURES_TO_PAUSE ? "pausedCredits" : "paused";
}

export function ScheduleCard({
  schedule,
  onToggleActive,
  isToggling,
  onDelete,
  isConfirmingDelete,
  isDeleting,
}: ScheduleCardProps) {
  const t = useTranslations("Schedules");
  const tStrategies = useTranslations("Strategies");
  const status = statusOf(schedule);

  const cadenceText =
    schedule.cadence === "weekly" && schedule.dayOfWeek !== null
      ? t("cadenceWeekly", { day: t(`weekday.${schedule.dayOfWeek}`) })
      : schedule.cadence === "monthly" && schedule.dayOfMonth !== null
        ? t("cadenceMonthly", { day: schedule.dayOfMonth })
        : t("cadenceDaily");

  const count = schedule.simulations.length;
  const displayName = schedule.name ?? t("fallbackName", { count });

  return (
    <div className="glass-card px-4 py-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-medium">{displayName}</h3>
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                status === "active" &&
                  "border-emerald-600/40 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/30 dark:text-emerald-300",
                status === "paused" && "border-border bg-muted text-muted-foreground",
                status === "pausedCredits" &&
                  "border-amber-600/40 bg-amber-500/10 text-amber-800 dark:border-amber-500/30 dark:text-amber-300"
              )}
            >
              {t(`status.${status}`)}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{cadenceText}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleActive}
            disabled={isToggling}
            title={schedule.active ? t("pauseAction") : t("resumeAction")}
            aria-label={schedule.active ? t("pauseAction") : t("resumeAction")}
            className="rounded-lg border border-border/50 bg-card/60 p-2 text-muted-foreground transition-all hover:border-border hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            {isToggling ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : schedule.active ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={isDeleting}
            title={isConfirmingDelete ? t("deleteConfirm") : t("deleteAction")}
            aria-label={isConfirmingDelete ? t("deleteConfirm") : t("deleteAction")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-card/60 p-2 text-muted-foreground transition-all hover:border-border hover:bg-accent hover:text-foreground disabled:opacity-50",
              isConfirmingDelete &&
                "border-rose-600/40 bg-rose-500/10 text-rose-700 hover:bg-rose-500/15 hover:text-rose-700 dark:border-rose-500/30 dark:text-rose-300 dark:hover:text-rose-300"
            )}
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {isConfirmingDelete && <span className="text-xs">{t("deleteConfirm")}</span>}
          </button>
        </div>
      </div>

      {status === "active" && schedule.consecutiveFailures > 0 && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {t("creditsWarning", {
            count: schedule.consecutiveFailures,
            max: CREDIT_FAILURES_TO_PAUSE,
          })}
        </p>
      )}
      {status === "pausedCredits" && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            {t("pausedCreditsHint")}{" "}
            <Link href="/billing" className="underline underline-offset-2">
              {t("buyCredits")}
            </Link>
          </span>
        </p>
      )}

      <ul className="mt-2 flex flex-wrap gap-1.5">
        {schedule.simulations.map((sim) => (
          <li key={sim.id}>
            <Link
              href={`/efficient-frontier/${sim.id}`}
              className="inline-block max-w-[16rem] truncate rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium transition-colors hover:text-primary"
            >
              {simulationDisplayName(sim, (s) => tStrategies(`${s}.label`))}
            </Link>
          </li>
        ))}
      </ul>

      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-border/50 pt-2 text-xs">
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">{t("nextRun")}</dt>
          <dd className="font-medium">
            {schedule.active ? formatDateDMY(schedule.nextRunAt, schedule.timezone) : "—"}
          </dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">{t("lastRun")}</dt>
          <dd className="font-medium">
            {schedule.lastRunAt
              ? formatDateDMY(schedule.lastRunAt, schedule.timezone)
              : t("never")}
          </dd>
        </div>
      </dl>
    </div>
  );
}
