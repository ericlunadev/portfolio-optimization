/**
 * When a schedule is next due.
 *
 * A schedule is due from **local midnight** of its next matching day, in the
 * schedule's own timezone. The cron fires once a day somewhere in 06:00–06:59
 * UTC, which lands on that same local day for every zone from UTC-12 to UTC+14:
 * east of UTC-6 local midnight has already passed at the morning tick, and west
 * of it the tick comes the next UTC morning, which is still the evening of the
 * local day. So "every Monday" is Monday where the user lives, without the
 * schedule ever promising an hour the cron cannot keep.
 */

export const CADENCES = ["daily", "weekly", "monthly"] as const;
export type Cadence = (typeof CADENCES)[number];

export const MAX_DAY_OF_MONTH = 28;

export interface ScheduleTiming {
  cadence: Cadence;
  /** 0 (Sunday) – 6 (Saturday); read for weekly only. */
  dayOfWeek?: number | null;
  /** 1–28; read for monthly only. */
  dayOfMonth?: number | null;
  timezone: string;
}

export interface LocalDate {
  year: number;
  /** 1–12 */
  month: number;
  day: number;
}

const MS_PER_DAY = 86_400_000;

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatters.set(timezone, formatter);
  }
  return formatter;
}

/** Wall-clock fields of an instant in a timezone. */
function wallClock(instant: Date, timezone: string) {
  const parts: Record<string, number> = {};
  for (const part of formatterFor(timezone).formatToParts(instant)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return parts as Record<"year" | "month" | "day" | "hour" | "minute" | "second", number>;
}

/** The calendar date an instant falls on in a timezone. */
export function localDateOf(instant: Date, timezone: string): LocalDate {
  const { year, month, day } = wallClock(instant, timezone);
  return { year, month, day };
}

/** `YYYY-MM-DD` for a local date. */
export function formatLocalDate({ year, month, day }: LocalDate): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** How far the timezone's wall clock is ahead of UTC at an instant, in ms. */
function offsetAt(instant: Date, timezone: string): number {
  const c = wallClock(instant, timezone);
  const asUtc = Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The first instant of a local date. Usually 00:00; on the few days a DST
 * change skips midnight (e.g. America/Santiago) it is the first minute that
 * exists, which is still the start of that day.
 */
export function startOfLocalDay(date: LocalDate, timezone: string): Date {
  const naive = Date.UTC(date.year, date.month - 1, date.day);
  // Two passes: the offset at the naive guess can differ from the offset at
  // the answer when a transition sits between them.
  let instant = naive - offsetAt(new Date(naive), timezone);
  instant = naive - offsetAt(new Date(instant), timezone);

  const landed = localDateOf(new Date(instant), timezone);
  if (formatLocalDate(landed) !== formatLocalDate(date)) {
    // Midnight does not exist that day and we landed on the previous evening:
    // step forward to the first hour on the right date.
    const shifted = instant + 3_600_000;
    if (formatLocalDate(localDateOf(new Date(shifted), timezone)) === formatLocalDate(date)) {
      return new Date(shifted);
    }
  }
  return new Date(instant);
}

function addDays(date: LocalDate, days: number): LocalDate {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day) + days * MS_PER_DAY);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function dayOfWeekOf(date: LocalDate): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

/**
 * The next local date strictly after `today` that the cadence runs on.
 * Strictly after, so a schedule created (or run) on a Monday next runs on a
 * later Monday rather than again today.
 */
export function nextRunDate(timing: ScheduleTiming, today: LocalDate): LocalDate {
  switch (timing.cadence) {
    case "daily":
      return addDays(today, 1);

    case "weekly": {
      const target = requireInRange(timing.dayOfWeek, 0, 6, "dayOfWeek");
      const ahead = (target - dayOfWeekOf(today) + 7) % 7 || 7;
      return addDays(today, ahead);
    }

    case "monthly": {
      const target = requireInRange(timing.dayOfMonth, 1, MAX_DAY_OF_MONTH, "dayOfMonth");
      if (today.day < target) return { year: today.year, month: today.month, day: target };
      const nextMonth = today.month === 12 ? 1 : today.month + 1;
      const year = today.month === 12 ? today.year + 1 : today.year;
      return { year, month: nextMonth, day: target };
    }
  }
}

/** The instant a schedule next becomes due, counting from `from`. */
export function computeNextRunAt(timing: ScheduleTiming, from: Date): Date {
  const today = localDateOf(from, timing.timezone);
  return startOfLocalDay(nextRunDate(timing, today), timing.timezone);
}

function requireInRange(
  value: number | null | undefined,
  min: number,
  max: number,
  field: string
): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${field} must be an integer in [${min}, ${max}]`);
  }
  return value;
}
