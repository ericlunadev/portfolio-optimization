import { describe, expect, it } from "vitest";
import {
  computeNextRunAt,
  isValidTimezone,
  localDateOf,
  nextRunDate,
  startOfLocalDay,
} from "./next-run.js";

const iso = (d: Date) => d.toISOString();

describe("startOfLocalDay", () => {
  it("is plain midnight UTC for UTC", () => {
    expect(iso(startOfLocalDay({ year: 2026, month: 3, day: 9 }, "UTC"))).toBe(
      "2026-03-09T00:00:00.000Z"
    );
  });

  it("uses the offset in force on that day, not today's", () => {
    // New York: EST (-5) before 8 March 2026, EDT (-4) after.
    expect(iso(startOfLocalDay({ year: 2026, month: 3, day: 7 }, "America/New_York"))).toBe(
      "2026-03-07T05:00:00.000Z"
    );
    expect(iso(startOfLocalDay({ year: 2026, month: 3, day: 9 }, "America/New_York"))).toBe(
      "2026-03-09T04:00:00.000Z"
    );
  });

  it("handles the DST change day itself (transition at 02:00)", () => {
    expect(iso(startOfLocalDay({ year: 2026, month: 3, day: 8 }, "America/New_York"))).toBe(
      "2026-03-08T05:00:00.000Z"
    );
    expect(iso(startOfLocalDay({ year: 2026, month: 11, day: 1 }, "America/New_York"))).toBe(
      "2026-11-01T04:00:00.000Z"
    );
  });

  it("lands on the first existing instant when DST skips midnight", () => {
    // Santiago springs forward at 24:00 on the first Saturday of September
    // 2026, so 6 September has no 00:00 — the day starts at 01:00 (-03).
    const start = startOfLocalDay({ year: 2026, month: 9, day: 6 }, "America/Santiago");
    expect(localDateOf(start, "America/Santiago")).toEqual({ year: 2026, month: 9, day: 6 });
    expect(localDateOf(new Date(start.getTime() - 1000), "America/Santiago")).toEqual({
      year: 2026,
      month: 9,
      day: 5,
    });
  });

  it("works east of UTC", () => {
    expect(iso(startOfLocalDay({ year: 2026, month: 7, day: 1 }, "Europe/Madrid"))).toBe(
      "2026-06-30T22:00:00.000Z"
    );
  });
});

describe("nextRunDate", () => {
  const monday = { year: 2026, month: 9, day: 14 };

  it("runs daily cadences tomorrow", () => {
    expect(nextRunDate({ cadence: "daily", timezone: "UTC" }, monday)).toEqual({
      year: 2026,
      month: 9,
      day: 15,
    });
  });

  it("rolls daily cadences over month and year ends", () => {
    expect(
      nextRunDate({ cadence: "daily", timezone: "UTC" }, { year: 2026, month: 12, day: 31 })
    ).toEqual({ year: 2027, month: 1, day: 1 });
    expect(
      nextRunDate({ cadence: "daily", timezone: "UTC" }, { year: 2028, month: 2, day: 28 })
    ).toEqual({ year: 2028, month: 2, day: 29 });
  });

  it("finds the next matching weekday, never today", () => {
    const weekly = (dayOfWeek: number) =>
      nextRunDate({ cadence: "weekly", dayOfWeek, timezone: "UTC" }, monday);
    expect(weekly(1)).toEqual({ year: 2026, month: 9, day: 21 }); // next Monday
    expect(weekly(2)).toEqual({ year: 2026, month: 9, day: 15 }); // tomorrow
    expect(weekly(0)).toEqual({ year: 2026, month: 9, day: 20 }); // Sunday
  });

  it("runs monthly later this month when the day is still ahead", () => {
    expect(
      nextRunDate({ cadence: "monthly", dayOfMonth: 20, timezone: "UTC" }, monday)
    ).toEqual({ year: 2026, month: 9, day: 20 });
  });

  it("runs monthly next month when the day is today or past", () => {
    expect(
      nextRunDate({ cadence: "monthly", dayOfMonth: 14, timezone: "UTC" }, monday)
    ).toEqual({ year: 2026, month: 10, day: 14 });
    expect(
      nextRunDate({ cadence: "monthly", dayOfMonth: 1, timezone: "UTC" }, monday)
    ).toEqual({ year: 2026, month: 10, day: 1 });
  });

  it("lands day_of_month 28 in February and wraps December", () => {
    expect(
      nextRunDate(
        { cadence: "monthly", dayOfMonth: 28, timezone: "UTC" },
        { year: 2027, month: 1, day: 31 }
      )
    ).toEqual({ year: 2027, month: 2, day: 28 });
    expect(
      nextRunDate(
        { cadence: "monthly", dayOfMonth: 28, timezone: "UTC" },
        { year: 2026, month: 12, day: 28 }
      )
    ).toEqual({ year: 2027, month: 1, day: 28 });
  });

  it("refuses days the cadence cannot hold", () => {
    expect(() =>
      nextRunDate({ cadence: "monthly", dayOfMonth: 31, timezone: "UTC" }, monday)
    ).toThrow(RangeError);
    expect(() => nextRunDate({ cadence: "weekly", dayOfWeek: 7, timezone: "UTC" }, monday)).toThrow(
      RangeError
    );
    expect(() => nextRunDate({ cadence: "weekly", timezone: "UTC" }, monday)).toThrow(RangeError);
  });
});

describe("computeNextRunAt", () => {
  it("counts days in the schedule's timezone, not UTC", () => {
    // 03:00 UTC on Tuesday is still Monday evening in Mexico City (UTC-6).
    const from = new Date("2026-09-15T03:00:00Z");
    const next = computeNextRunAt({ cadence: "daily", timezone: "America/Mexico_City" }, from);
    expect(iso(next)).toBe("2026-09-15T06:00:00.000Z"); // Tuesday 00:00 local
  });

  it("is due by the next morning tick on the local day, across zones", () => {
    // A weekly Monday schedule, computed the previous week.
    const from = new Date("2026-09-08T12:00:00Z");
    for (const timezone of [
      "Pacific/Kiritimati", // UTC+14
      "Europe/Madrid",
      "UTC",
      "America/Argentina/Buenos_Aires",
      "America/Mexico_City",
      "America/Los_Angeles",
      "Pacific/Honolulu", // UTC-10
    ]) {
      const dueAt = computeNextRunAt({ cadence: "weekly", dayOfWeek: 1, timezone }, from);
      // The first daily tick (06:30 UTC) at or after the due instant…
      const tick = new Date(dueAt);
      tick.setUTCHours(6, 30, 0, 0);
      if (tick < dueAt) tick.setUTCDate(tick.getUTCDate() + 1);
      // …falls on Monday where the user lives.
      expect(localDateOf(tick, timezone), timezone).toEqual({ year: 2026, month: 9, day: 14 });
    }
  });

  it("stays on the same local midnight across a DST change", () => {
    const from = new Date("2026-10-30T12:00:00Z"); // Friday
    const next = computeNextRunAt(
      { cadence: "weekly", dayOfWeek: 1, timezone: "America/New_York" },
      from
    );
    // Monday 2 November, after clocks fell back: midnight EST is 05:00 UTC.
    expect(iso(next)).toBe("2026-11-02T05:00:00.000Z");
  });
});

describe("isValidTimezone", () => {
  it("accepts IANA names and rejects anything else", () => {
    expect(isValidTimezone("America/Argentina/Buenos_Aires")).toBe(true);
    expect(isValidTimezone("UTC")).toBe(true);
    expect(isValidTimezone("Mars/Olympus_Mons")).toBe(false);
  });
});
