import type { SimulationListItem, SimulationRun } from "@/lib/api";

/**
 * Helpers for scheduled simulations: date display, which saved simulations a
 * schedule can replay, and the run-over-run deltas in the history table.
 */

/** A schedule is paused for credits once this many runs in a row were skipped. */
export const CREDIT_FAILURES_TO_PAUSE = 3;

export const MAX_DAY_OF_MONTH = 28;

/**
 * DD/MM/YYYY for an ISO instant. Pass the schedule's timezone for its run
 * dates: they are local midnights there, and the viewer's own zone could put
 * them on the previous day.
 */
export function formatDateDMY(iso: string, timeZone?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")}`;
}

/** DD/MM/YYYY for the last day of a month (1–12). */
export function formatMonthEndDMY(month: number, year: number): string {
  const lastDay = new Date(year, month, 0).getDate();
  return `${String(lastDay).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

/**
 * Whether the server can replay a saved simulation on a schedule. Simulations
 * saved from the mobile app store the raw optimize request, with no
 * `dateRange` to move forward; the API refuses those.
 */
export function isReplayable(simulation: Pick<SimulationListItem, "params">): boolean {
  const range = (simulation.params as Partial<SimulationListItem["params"]> | undefined)
    ?.dateRange;
  return (
    !!range &&
    typeof range.startMonth === "number" &&
    typeof range.startYear === "number"
  );
}

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export interface RunMetricDeltas {
  expectedReturn: number | null;
  volatility: number | null;
  sharpeRatio: number | null;
}

/**
 * For each run (newest first, as the API returns them), how its headline
 * metrics moved against the previous *successful* run. Failed runs, and the
 * oldest successful run, get no deltas.
 */
export function runDeltas(runs: SimulationRun[]): (RunMetricDeltas | null)[] {
  return runs.map((run, i) => {
    if (run.status !== "success") return null;
    const previous = runs.slice(i + 1).find((r) => r.status === "success");
    if (!previous) return null;
    const diff = (a: number | null, b: number | null) =>
      a === null || b === null ? null : a - b;
    return {
      expectedReturn: diff(run.expectedReturn, previous.expectedReturn),
      volatility: diff(run.volatility, previous.volatility),
      sharpeRatio: diff(run.sharpeRatio, previous.sharpeRatio),
    };
  });
}
