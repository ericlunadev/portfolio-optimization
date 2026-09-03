import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ReportAvailability,
  defaultReportConfig,
  hasReportContent,
  isChartSelected,
  loadReportConfig,
  normalizeReportConfig,
  saveReportConfig,
  setChartSelected,
} from "./report-config";

const availability: ReportAvailability = {
  comparison: true,
  assetLimits: true,
  chartKeys: ["risk-return", "weights"],
};

/** A config with every section switched off. */
function emptyConfig() {
  const config = defaultReportConfig();
  return {
    ...config,
    sections: {
      metrics: false,
      parameters: false,
      allocation: false,
      risk: false,
      comparison: false,
      charts: false,
    },
  };
}

describe("defaultReportConfig", () => {
  it("selects every section and field", () => {
    const config = defaultReportConfig();

    expect(Object.values(config.sections).every(Boolean)).toBe(true);
    expect(Object.values(config.metrics).every(Boolean)).toBe(true);
    expect(Object.values(config.allocationColumns).every(Boolean)).toBe(true);
    expect(config.title).toBe("");
  });
});

describe("isChartSelected", () => {
  it("includes a chart the config has never heard of", () => {
    expect(isChartSelected(defaultReportConfig(), "brand-new-chart")).toBe(true);
  });

  it("honours an explicit exclusion", () => {
    const config = setChartSelected(defaultReportConfig(), "weights", false);

    expect(isChartSelected(config, "weights")).toBe(false);
    expect(isChartSelected(config, "risk-return")).toBe(true);
  });
});

describe("hasReportContent", () => {
  it("is true for the default config", () => {
    expect(hasReportContent(defaultReportConfig(), availability)).toBe(true);
  });

  it("is false when every section is off", () => {
    expect(hasReportContent(emptyConfig(), availability)).toBe(false);
  });

  it("is false when the only section left has no fields selected", () => {
    const config = {
      ...emptyConfig(),
      sections: { ...emptyConfig().sections, metrics: true },
      metrics: {
        expectedReturn: false,
        volatility: false,
        sharpeRatio: false,
        probNeg1y: false,
      },
    };

    expect(hasReportContent(config, availability)).toBe(false);
  });

  it("ignores sections this simulation cannot offer", () => {
    const config = {
      ...emptyConfig(),
      sections: { ...emptyConfig().sections, comparison: true },
    };

    expect(hasReportContent(config, availability)).toBe(true);
    expect(
      hasReportContent(config, { ...availability, comparison: false })
    ).toBe(false);
  });

  it("is false when the charts section is on but every chart is excluded", () => {
    let config = {
      ...emptyConfig(),
      sections: { ...emptyConfig().sections, charts: true },
    };
    availability.chartKeys.forEach((key) => {
      config = setChartSelected(config, key, false);
    });

    expect(hasReportContent(config, availability)).toBe(false);
  });
});

describe("normalizeReportConfig", () => {
  it("falls back to the defaults for junk input", () => {
    expect(normalizeReportConfig(null)).toEqual(defaultReportConfig());
    expect(normalizeReportConfig("nonsense")).toEqual(defaultReportConfig());
  });

  it("keeps known flags and fills the rest from the defaults", () => {
    const config = normalizeReportConfig({
      sections: { charts: false, unknownSection: false },
      riskHorizons: { m1: false },
    });

    expect(config.sections.charts).toBe(false);
    expect(config.sections.metrics).toBe(true);
    expect(config.riskHorizons.m1).toBe(false);
    expect(config.riskHorizons.y2).toBe(true);
    expect(config.sections).not.toHaveProperty("unknownSection");
  });

  it("drops non-boolean flags and non-string titles", () => {
    const config = normalizeReportConfig({
      title: 42,
      sections: { metrics: "yes" },
      charts: { weights: false, broken: "no" },
    });

    expect(config.title).toBe("");
    expect(config.sections.metrics).toBe(true);
    expect(config.charts).toEqual({ weights: false });
  });
});

describe("report config storage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubStorage(initial: string | null = null) {
    let value = initial;
    const localStorage = {
      getItem: vi.fn(() => value),
      setItem: vi.fn((_key: string, next: string) => {
        value = next;
      }),
    };
    vi.stubGlobal("window", { localStorage });
    return localStorage;
  }

  it("round-trips a config but never carries the title over", () => {
    const storage = stubStorage();
    const config = setChartSelected(
      { ...defaultReportConfig(), title: "Q3 review" },
      "weights",
      false
    );

    saveReportConfig(config);
    const [, written] = storage.setItem.mock.calls[0];
    expect(JSON.parse(written)).not.toHaveProperty("title");

    stubStorage(written);
    const loaded = loadReportConfig();
    expect(loaded.title).toBe("");
    expect(isChartSelected(loaded, "weights")).toBe(false);
  });

  it("falls back to the defaults when the stored value is corrupt", () => {
    stubStorage("{not json");

    expect(loadReportConfig()).toEqual(defaultReportConfig());
  });
});
