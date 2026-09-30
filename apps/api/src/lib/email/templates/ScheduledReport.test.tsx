import { describe, expect, it } from "vitest";
import { render } from "@react-email/render";
import { emailMessages } from "../i18n.js";
import { ScheduledNoCredits, ScheduledReport, formatDelta, type ReportEntry } from "./ScheduledReport.js";

const entry: ReportEntry = {
  simulationId: "sim-1",
  name: "Retirement mix",
  periodStart: "01/01/2020",
  periodEnd: "30/09/2026",
  current: { expectedReturn: 0.0912, volatility: 0.11, sharpeRatio: 0.52 },
  previous: { expectedReturn: 0.0875, volatility: 0.115, sharpeRatio: 0.52 },
  weights: [{ ticker: "SPY", weight: 0.7, previousWeight: 0.6 }],
  url: "https://app.example/efficient-frontier/sim-1",
};

describe("ScheduledReport", () => {
  it.each(["es", "en"] as const)("renders the %s report with its disclaimer", async (locale) => {
    const html = await render(
      <ScheduledReport
        locale={locale}
        userName="Ada"
        scheduleName="Weekly"
        entries={[entry, { ...entry, simulationId: "sim-2", previous: null }]}
        failedCount={1}
        manageUrl="https://app.example/schedules"
      />
    );
    const m = emailMessages[locale];
    expect(html).toContain(m.investingDisclaimer);
    expect(html).toContain(m.scheduledFirstRun);
    expect(html).toContain(m.scheduledRunFailed(1));
    expect(html).toContain("01/01/2020 – 30/09/2026");
    expect(html).toContain("9.12%");
    expect(html).toContain("+0.37 pp");
    expect(html).toContain("60.00% → 70.00%");
    expect(html).toContain("https://app.example/schedules");
  });

  it("renders the out-of-credits notice in the schedule's language", async () => {
    const html = await render(
      <ScheduledNoCredits
        locale="en"
        pauseAfterAttempts={3}
        billingUrl="https://app.example/billing"
        manageUrl="https://app.example/schedules"
      />
    );
    expect(html).toContain(emailMessages.en.scheduledNoCredits);
    expect(html).toContain("after 3 attempts");
  });
});

describe("formatDelta", () => {
  it("signs changes and reports rates in percentage points", () => {
    expect(formatDelta(0.1, 0.08, "rate")).toBe("+2.00 pp");
    expect(formatDelta(0.4, 0.5, "ratio")).toBe("−0.10");
    expect(formatDelta(0.5, 0.5, "ratio")).toBe("0.00");
  });
});
