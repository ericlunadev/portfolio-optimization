import { describe, it, expect } from "vitest";
import {
  buildSimulationPdf,
  formatReportDate,
  simulationPdfFilename,
  type SimulationPdfInput,
  type SimulationPdfLabels,
} from "./simulation-pdf";
import type { OptimizationResultWithStrategy, SimulationParams } from "./api";

/** 1x1 RGB PNG, enough to exercise the chart-embedding path. */
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMQFBIHAAByADveLFgAAAAAAElFTkSuQmCC";

const params: SimulationParams = {
  tickers: ["AAPL", "MSFT", "GOOG"],
  assets: [
    { ticker: "AAPL", allocation: 50 },
    { ticker: "MSFT", allocation: 30 },
    { ticker: "GOOG", allocation: 20 },
  ],
  dateRange: { startMonth: 1, startYear: 2020, endMonth: 12, endYear: 2022 },
  strategy: "max-sharpe",
  riskFreeRate: 0.02,
  enforceFullInvestment: true,
  allowShortSelling: false,
  useLeverage: false,
  maxLeverage: 1,
  assetConstraints: false,
  wMax: 1,
  showFrontier: true,
};

const result: OptimizationResultWithStrategy = {
  weights: [
    { fund_id: 1, fund_name: "AAPL", weight: 0.5, exp_ret: 0.12, volatility: 0.2 },
    { fund_id: 2, fund_name: "MSFT", weight: 0.3, exp_ret: 0.1, volatility: 0.18 },
    { fund_id: 3, fund_name: "GOOG", weight: 0.2, exp_ret: 0.09, volatility: 0.22 },
  ],
  expected_return: 0.11,
  volatility: 0.19,
  sharpe_ratio: 0.47,
  strategy: "max-sharpe",
  stats: {
    ci_95_low: -0.26,
    ci_95_high: 0.48,
    prob_neg_1m: 0.44,
    prob_neg_3m: 0.4,
    prob_neg_1y: 0.28,
    prob_neg_2y: 0.2,
  },
};

const labels: SimulationPdfLabels = {
  documentTitle: "Portfolio Optimization Report",
  generatedAtLabel: "Generated on",
  parametersHeading: "Simulation parameters",
  allocationHeading: "Allocation and metrics per asset",
  riskHeading: "Probability of a negative return",
  comparisonHeading: "Portfolio Comparison",
  expectedReturn: "Expected Return",
  volatility: "Volatility",
  sharpeRatio: "Sharpe Ratio",
  probNeg1y: "1Y Negative Prob.",
  ci95Label: "95% CI",
  notAvailable: "N/A",
  dateRange: "Date Range",
  strategy: "Strategy",
  riskFreeRate: "Risk-Free Rate",
  targetReturn: "Target Return",
  targetRisk: "Target Risk",
  fullInvestment: "Full Investment",
  shortSelling: "Short Selling",
  shortSellingAllowed: "Allowed",
  shortSellingNotAllowed: "Not allowed",
  maxLeverage: "Maximum Leverage",
  maxWeightPerAsset: "Maximum Weight per Asset",
  assets: "Assets",
  yes: "Yes",
  no: "No",
  tableAsset: "Asset",
  tableExpReturn: "Exp. Return",
  tableVolatility: "Volatility",
  tableWeight: "Weight",
  tableLimits: "Limits",
  horizonHeader: "Horizon",
  probabilityHeader: "Probability",
  horizon1m: "1 Month",
  horizon3m: "3 Months",
  horizon1y: "1 Year",
  horizon2y: "2 Years",
  compareOptimal: "Optimal",
  compareUserAlloc: "Your Alloc.",
  compareReturnLabel: "Return",
  compareVolatilityLabel: "Volatility",
  compareDisclaimer: "* Approximated by a weighted average.",
  disclaimer: "Informational document.",
  formatPage: (current, total) => `Page ${current} of ${total}`,
};

function makeInput(
  overrides: Partial<SimulationPdfInput> = {}
): SimulationPdfInput {
  return {
    title: "Tech Portfolio",
    strategyLabel: "Max Sharpe (Optimal)",
    generatedAt: new Date(2026, 6, 28),
    params,
    result,
    userPortfolio: null,
    charts: [],
    labels,
    ...overrides,
  };
}

describe("simulationPdfFilename", () => {
  it("slugifies the title and appends the generation date", () => {
    expect(simulationPdfFilename("Tech Portfolio", new Date(2026, 6, 28))).toBe(
      "tech-portfolio-2026-07-28.pdf"
    );
  });

  it("strips accents and punctuation", () => {
    expect(
      simulationPdfFilename("Máximo Sharpe (Óptimo)", new Date(2026, 0, 5))
    ).toBe("maximo-sharpe-optimo-2026-01-05.pdf");
  });

  it("falls back to a default name when nothing survives slugification", () => {
    expect(simulationPdfFilename("¿?¡!", new Date(2026, 0, 5))).toBe(
      "simulation-2026-01-05.pdf"
    );
  });
});

describe("formatReportDate", () => {
  it("uses the project-wide DD/MM/YYYY format", () => {
    expect(formatReportDate(new Date(2022, 11, 31))).toBe("31/12/2022");
  });

  it("zero-pads single-digit days and months", () => {
    expect(formatReportDate(new Date(2026, 0, 5))).toBe("05/01/2026");
  });
});

describe("buildSimulationPdf", () => {
  it("produces a valid single-page PDF for a chartless report", async () => {
    const doc = await buildSimulationPdf(makeInput());

    expect(doc.getNumberOfPages()).toBe(1);
    const bytes = new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);
    const header = Array.from(bytes.slice(0, 5))
      .map((byte) => String.fromCharCode(byte))
      .join("");
    expect(header).toBe("%PDF-");
  });

  it("adds pages as charts are appended", async () => {
    const chart = {
      title: "Risk vs Return",
      dataUrl: TINY_PNG,
      width: 880,
      height: 400,
      legend: [{ label: "Efficient Frontier", color: "#a78bfa" }],
    };
    const doc = await buildSimulationPdf(
      makeInput({ charts: [chart, chart, chart, chart, chart] })
    );

    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
  });

  it("includes the comparison section only when a user portfolio is given", async () => {
    const withComparison = await buildSimulationPdf(
      makeInput({ userPortfolio: { expectedReturn: 0.1, volatility: 0.21 } })
    );
    const without = await buildSimulationPdf(makeInput());

    expect(extractText(withComparison)).toContain("Your Alloc.");
    expect(extractText(without)).not.toContain("Your Alloc.");
  });

  it("writes the report title and asset rows as real text", async () => {
    const text = extractText(await buildSimulationPdf(makeInput()));

    expect(text).toContain("Tech Portfolio");
    expect(text).toContain("AAPL");
    expect(text).toContain("50.00%");
  });
});

/**
 * jsPDF writes uncompressed text streams when `compress` is off, but we build
 * with compression on, so read the strings back off the internal page model.
 */
function extractText(doc: Awaited<ReturnType<typeof buildSimulationPdf>>): string {
  const internal = doc.internal as unknown as {
    pages: string[][];
  };
  return internal.pages.flat().join("\n");
}
