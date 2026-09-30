import { describe, expect, it } from "vitest";
import type { SimulationRun } from "@/lib/api";
import { formatDateDMY, formatMonthEndDMY, isReplayable, runDeltas } from "./schedules";

function run(overrides: Partial<SimulationRun>): SimulationRun {
  return {
    id: "r",
    scheduleId: "s",
    status: "success",
    errorMessage: null,
    dateRange: null,
    expectedReturn: 0.1,
    volatility: 0.2,
    sharpeRatio: 0.5,
    weights: [],
    createdAt: "2026-09-16T06:30:00.000Z",
    ...overrides,
  };
}

describe("formatDateDMY", () => {
  it("formats in the given timezone", () => {
    // Local midnight in Mexico City is 06:00 UTC.
    expect(formatDateDMY("2026-09-21T06:00:00.000Z", "America/Mexico_City")).toBe("21/09/2026");
    expect(formatDateDMY("2026-09-21T03:00:00.000Z", "America/Mexico_City")).toBe("20/09/2026");
    expect(formatDateDMY("2026-12-31T12:00:00.000Z", "UTC")).toBe("31/12/2026");
  });
});

describe("formatMonthEndDMY", () => {
  it("uses the last day of the month", () => {
    expect(formatMonthEndDMY(2, 2028)).toBe("29/02/2028");
    expect(formatMonthEndDMY(9, 2026)).toBe("30/09/2026");
  });
});

describe("isReplayable", () => {
  it("accepts web params and refuses mobile ones", () => {
    const web = { dateRange: { startMonth: 1, startYear: 2020, endMonth: 1, endYear: 2025 } };
    const mobile = { tickers: ["SPY"], start_date: "2020-01-01" };
    expect(isReplayable({ params: web } as never)).toBe(true);
    expect(isReplayable({ params: mobile } as never)).toBe(false);
  });
});

describe("runDeltas", () => {
  it("compares each success with the previous success, skipping failures", () => {
    const runs = [
      run({ id: "3", expectedReturn: 0.12, volatility: 0.18, sharpeRatio: 0.7 }),
      run({ id: "2", status: "failed", expectedReturn: null, volatility: null, sharpeRatio: null }),
      run({ id: "1", expectedReturn: 0.1, volatility: 0.2, sharpeRatio: 0.5 }),
    ];
    const [latest, failed, first] = runDeltas(runs);
    expect(latest?.expectedReturn).toBeCloseTo(0.02);
    expect(latest?.volatility).toBeCloseTo(-0.02);
    expect(latest?.sharpeRatio).toBeCloseTo(0.2);
    expect(failed).toBeNull();
    expect(first).toBeNull();
  });
});
