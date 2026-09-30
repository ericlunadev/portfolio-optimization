import { describe, expect, it } from "vitest";
import { render } from "@react-email/render";
import { emailMessages } from "../i18n.js";
import {
  ScheduledNoCredits,
  ScheduledReport,
  accentColors,
  formatDelta,
  type ReportEntry,
} from "./ScheduledReport.js";

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

  it("carries the tenant's name, disclaimer and accent instead of ours", async () => {
    const branding = {
      productName: "Acme Wealth",
      accentHex: "#0b3d91",
      disclaimerText: "Acme is not an adviser.",
    };
    const report = await render(
      <ScheduledReport
        locale="en"
        entries={[entry]}
        failedCount={0}
        manageUrl="https://acme.example/schedules"
        branding={branding}
      />
    );
    const notice = await render(
      <ScheduledNoCredits
        locale="en"
        pauseAfterAttempts={3}
        billingUrl="https://acme.example/billing"
        manageUrl="https://acme.example/schedules"
        branding={branding}
      />
    );

    for (const html of [report, notice]) {
      expect(html).toContain("Acme Wealth");
      expect(html).not.toContain(emailMessages.en.brand);
      expect(html).not.toContain("#c8a45c");
      expect(html).toContain("#0b3d91");
    }
    expect(report).toContain("Acme is not an adviser.");
    expect(report).not.toContain(emailMessages.en.investingDisclaimer);
  });

  it("falls back to our own brand field by field", async () => {
    const html = await render(
      <ScheduledReport
        locale="en"
        entries={[entry]}
        failedCount={0}
        manageUrl="https://app.example/schedules"
        branding={{ productName: "Acme Wealth", accentHex: null, disclaimerText: null }}
      />
    );
    expect(html).toContain("Acme Wealth");
    expect(html).toContain("#c8a45c");
    expect(html).toContain(emailMessages.en.investingDisclaimer);
  });
});

describe("accentColors", () => {
  it("puts dark text on a light accent and white text on a dark one", () => {
    expect(accentColors("#c8a45c")).toEqual({ accent: "#c8a45c", onAccent: "#1c1917" });
    expect(accentColors("#0b3d91")).toEqual({ accent: "#0b3d91", onAccent: "#ffffff" });
  });

  it("uses our accent when the tenant's is missing or not a hex colour", () => {
    expect(accentColors(null).accent).toBe("#c8a45c");
    expect(accentColors("navy").accent).toBe("#c8a45c");
  });
});

describe("formatDelta", () => {
  it("signs changes and reports rates in percentage points", () => {
    expect(formatDelta(0.1, 0.08, "rate")).toBe("+2.00 pp");
    expect(formatDelta(0.4, 0.5, "ratio")).toBe("−0.10");
    expect(formatDelta(0.5, 0.5, "ratio")).toBe("0.00");
  });
});
