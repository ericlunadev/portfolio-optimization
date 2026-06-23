import { describe, it, expect } from "vitest";
import { todayDateOnly, dateOnly, defaultLookbackPeriod, toISOStringOrNow } from "./dates.js";

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

describe("dateOnly", () => {
  it("formats a Date as YYYY-MM-DD", () => {
    expect(dateOnly(new Date("2022-12-31T18:30:00.000Z"))).toBe("2022-12-31");
  });

  it("accepts an ISO string", () => {
    expect(dateOnly("2020-01-15T00:00:00.000Z")).toBe("2020-01-15");
  });

  it("accepts an epoch milliseconds number", () => {
    expect(dateOnly(Date.UTC(2021, 5, 1))).toBe("2021-06-01");
  });
});

describe("todayDateOnly", () => {
  it("returns a date-only string", () => {
    expect(todayDateOnly()).toMatch(DATE_ONLY_RE);
  });
});

describe("defaultLookbackPeriod", () => {
  it("returns two date-only strings with period1 before period2", () => {
    const { period1, period2 } = defaultLookbackPeriod();
    expect(period1).toMatch(DATE_ONLY_RE);
    expect(period2).toMatch(DATE_ONLY_RE);
    expect(period1 < period2).toBe(true);
  });

  it("looks back roughly five years", () => {
    const { period1, period2 } = defaultLookbackPeriod();
    const years = (Date.parse(period2) - Date.parse(period1)) / (365 * 24 * 60 * 60 * 1000);
    expect(years).toBeGreaterThan(4.9);
    expect(years).toBeLessThan(5.1);
  });
});

describe("toISOStringOrNow", () => {
  it("serializes a provided Date", () => {
    const date = new Date("2023-07-04T12:00:00.000Z");
    expect(toISOStringOrNow(date)).toBe("2023-07-04T12:00:00.000Z");
  });

  it("falls back to a valid ISO string when given null or undefined", () => {
    expect(() => new Date(toISOStringOrNow(null)).toISOString()).not.toThrow();
    expect(toISOStringOrNow(undefined)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
