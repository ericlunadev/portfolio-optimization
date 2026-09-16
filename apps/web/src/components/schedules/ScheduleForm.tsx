"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import {
  ApiError,
  type CreateScheduleInput,
  type ScheduleCadence,
  type SimulationListItem,
} from "@/lib/api";
import { browserTimezone, isReplayable, MAX_DAY_OF_MONTH } from "@/lib/schedules";
import { cn } from "@/lib/utils";

const CADENCES: ScheduleCadence[] = ["daily", "weekly", "monthly"];
/** Monday first, the way both locales read a week. */
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];

interface ScheduleFormProps {
  simulations: SimulationListItem[];
  /** Simulation ids ticked when the form opens. */
  initialSimulationIds?: string[];
  onSubmit: (input: CreateScheduleInput) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
  /** Rejection from the last submit, shown above the buttons. */
  error: unknown;
}

export function simulationDisplayName(
  sim: { name: string | null; tickers: string[]; strategy: string },
  strategyLabel: (strategy: string) => string
): string {
  if (sim.name) return sim.name;
  const tickers =
    sim.tickers.length <= 4
      ? sim.tickers.join(", ")
      : `${sim.tickers.slice(0, 3).join(", ")} +${sim.tickers.length - 3}`;
  return `${tickers} - ${strategyLabel(sim.strategy)}`;
}

/**
 * Inline form for creating a schedule. There is deliberately no time-of-day
 * field: the daily cron can only promise a day, not an hour.
 */
export function ScheduleForm({
  simulations,
  initialSimulationIds = [],
  onSubmit,
  onCancel,
  isSaving,
  error,
}: ScheduleFormProps) {
  const t = useTranslations("Schedules");
  const tStrategies = useTranslations("Strategies");
  const locale = useLocale();

  const [name, setName] = useState("");
  const [cadence, setCadence] = useState<ScheduleCadence>("weekly");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        initialSimulationIds.filter((id) => {
          const sim = simulations.find((s) => s.id === id);
          return sim && isReplayable(sim);
        })
      )
  );

  const strategyLabel = (strategy: string) => tStrategies(`${strategy}.label`);
  const nameOf = (id: string) => {
    const sim = simulations.find((s) => s.id === id);
    return sim ? simulationDisplayName(sim, strategyLabel) : id;
  };

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selected.size === 0) return;
    await onSubmit({
      name: name.trim() || null,
      cadence,
      dayOfWeek: cadence === "weekly" ? dayOfWeek : null,
      dayOfMonth: cadence === "monthly" ? dayOfMonth : null,
      timezone: browserTimezone(),
      locale,
      simulationIds: Array.from(selected),
    });
  }

  const errorMessage = describeError(error, t, nameOf);
  const hasUnreplayable = simulations.some((sim) => !isReplayable(sim));

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-border bg-card p-4 dark:border-border/50 dark:bg-card/40 md:p-5"
    >
      <h2 className="mb-4 font-display text-lg tracking-tight">{t("formTitle")}</h2>

      <label className="mb-4 block">
        <span className="mb-1 block text-xs font-medium text-muted-foreground">
          {t("nameLabel")}
        </span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("namePlaceholder")}
          maxLength={200}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>

      <fieldset className="mb-4">
        <legend className="mb-1 block text-xs font-medium text-muted-foreground">
          {t("cadenceLabel")}
        </legend>
        <div className="inline-flex rounded-md border border-border p-0.5 dark:border-border/60">
          {CADENCES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setCadence(value)}
              aria-pressed={cadence === value}
              className={cn(
                "rounded px-3 py-1.5 text-sm transition-colors",
                cadence === value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t(`cadence.${value}`)}
            </button>
          ))}
        </div>
      </fieldset>

      {cadence === "weekly" && (
        <fieldset className="mb-4">
          <legend className="mb-1 block text-xs font-medium text-muted-foreground">
            {t("dayOfWeekLabel")}
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => setDayOfWeek(day)}
                aria-pressed={dayOfWeek === day}
                className={cn(
                  "min-w-[3rem] rounded-md border px-2.5 py-1.5 text-sm transition-colors",
                  dayOfWeek === day
                    ? "border-primary/50 bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent hover:text-foreground dark:border-border/60"
                )}
              >
                {t(`weekdayShort.${day}`)}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {cadence === "monthly" && (
        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            {t("dayOfMonthLabel")}
          </span>
          <select
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(Number(e.target.value))}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {Array.from({ length: MAX_DAY_OF_MONTH }, (_, i) => i + 1).map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-muted-foreground">
            {t("dayOfMonthHint", { max: MAX_DAY_OF_MONTH })}
          </span>
        </label>
      )}

      <fieldset className="mb-4">
        <legend className="mb-1 block text-xs font-medium text-muted-foreground">
          {t("simulationsLabel")}
        </legend>
        {simulations.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noSimulations")}</p>
        ) : (
          <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-border p-1 dark:border-border/60">
            {simulations.map((sim) => {
              const replayable = isReplayable(sim);
              return (
                <li key={sim.id}>
                  <label
                    className={cn(
                      "flex items-start gap-2.5 rounded px-2 py-1.5 text-sm",
                      replayable ? "cursor-pointer hover:bg-accent" : "cursor-not-allowed opacity-50"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(sim.id)}
                      disabled={!replayable}
                      onChange={() => toggle(sim.id)}
                      className="mt-0.5 h-4 w-4 accent-primary"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">
                        {simulationDisplayName(sim, strategyLabel)}
                      </span>
                      {!replayable && (
                        <span className="block text-xs text-muted-foreground">
                          {t("unreplayableHint")}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {hasUnreplayable && (
          <p className="mt-1 text-xs text-muted-foreground">{t("unreplayableExplainer")}</p>
        )}
      </fieldset>

      <ul className="mb-4 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
        <li>{t("helpDelivery")}</li>
        <li>{t("helpCost")}</li>
        <li>{t("helpWindow")}</li>
      </ul>

      {errorMessage && (
        <p className="mb-3 text-sm text-rose-600 dark:text-rose-400" role="alert">
          {errorMessage}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {t("cancel")}
        </button>
        <button
          type="submit"
          disabled={isSaving || selected.size === 0}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
          {t("create")}
        </button>
      </div>
    </form>
  );
}

function describeError(
  error: unknown,
  t: ReturnType<typeof useTranslations<"Schedules">>,
  nameOf: (id: string) => string
): string | null {
  if (!error) return null;
  if (error instanceof ApiError) {
    if (error.code === "unreplayable_simulation") {
      const ids = Array.isArray(error.body?.simulationIds)
        ? (error.body.simulationIds as string[])
        : [];
      return t("errorUnreplayable", { names: ids.map(nameOf).join(", ") });
    }
    if (error.status === 404) return t("errorNotFound");
  }
  return t("errorGeneric");
}
