import { describe, it, expect } from "vitest";
import { buildBenchmarkChartData } from "./benchmark-chart";
import type {
  BenchmarkComparisonEntry,
  BenchmarkComparisonResponse,
  BenchmarkPerformance,
} from "./api";

function performance(
  series: [string, number][]
): BenchmarkPerformance {
  return {
    expected_return: 0.1,
    volatility: 0.2,
    sharpe_ratio: 0.5,
    max_drawdown: -0.3,
    total_return: 0.4,
    series: series.map(([date, value]) => ({ date, value })),
  };
}

function benchmark(
  id: string,
  series: [string, number][]
): BenchmarkComparisonEntry {
  return {
    ...performance(series),
    id,
    category: "equity",
    tickers: [id.toUpperCase()],
  };
}

function response(
  portfolio: BenchmarkPerformance | null,
  benchmarks: BenchmarkComparisonEntry[]
): BenchmarkComparisonResponse {
  return {
    window: { start: "2024-01-01", end: "2024-12-31" },
    portfolio,
    benchmarks,
    unavailable: [],
  };
}

const BASE = {
  portfolioLabel: "Optimal Portfolio",
  portfolioColor: "#gold",
  colorById: { sp500: "#blue", gold: "#teal" },
  nameById: (id: string) => (id === "sp500" ? "S&P 500" : "Gold"),
};

describe("buildBenchmarkChartData", () => {
  it("puts the portfolio first and benchmarks in the order they were picked", () => {
    const result = buildBenchmarkChartData({
      ...BASE,
      comparison: response(performance([["2024-01-02", 0]]), [
        benchmark("sp500", [["2024-01-02", 0]]),
        benchmark("gold", [["2024-01-02", 0]]),
      ]),
      // Deliberately the reverse of the order the API answered in.
      selected: ["gold", "sp500"],
    });

    expect(result.series).toEqual(["Optimal Portfolio", "Gold", "S&P 500"]);
  });

  it("merges series into one row per date, sorted chronologically", () => {
    const result = buildBenchmarkChartData({
      ...BASE,
      comparison: response(
        performance([
          ["2024-01-03", 0.02],
          ["2024-01-02", 0],
        ]),
        [
          benchmark("sp500", [
            ["2024-01-02", 0],
            ["2024-01-03", 0.01],
          ]),
        ]
      ),
      selected: ["sp500"],
    });

    expect(result.data).toEqual([
      { date: "2024-01-02", "Optimal Portfolio": 0, "S&P 500": 0 },
      { date: "2024-01-03", "Optimal Portfolio": 0.02, "S&P 500": 0.01 },
    ]);
  });

  it("leaves a series absent on dates its market did not trade", () => {
    // A benchmark on a foreign calendar simply has no key on that row; the
    // chart connects across the gap rather than dropping the date.
    const result = buildBenchmarkChartData({
      ...BASE,
      comparison: response(
        performance([
          ["2024-01-02", 0],
          ["2024-01-03", 0.01],
          ["2024-01-04", 0.02],
        ]),
        [
          benchmark("sp500", [
            ["2024-01-02", 0],
            ["2024-01-04", 0.05],
          ]),
        ]
      ),
      selected: ["sp500"],
    });

    expect(result.data).toHaveLength(3);
    expect(result.data[1]).toEqual({ date: "2024-01-03", "Optimal Portfolio": 0.01 });
    expect("S&P 500" in result.data[1]).toBe(false);
  });

  it("keeps a date that only a benchmark traded on", () => {
    const result = buildBenchmarkChartData({
      ...BASE,
      comparison: response(performance([["2024-01-02", 0]]), [
        benchmark("sp500", [
          ["2024-01-02", 0],
          ["2024-01-03", 0.01],
        ]),
      ]),
      selected: ["sp500"],
    });

    expect(result.data.map((row) => row.date)).toEqual([
      "2024-01-02",
      "2024-01-03",
    ]);
  });

  it("maps each series to its assigned colour", () => {
    const result = buildBenchmarkChartData({
      ...BASE,
      comparison: response(performance([["2024-01-02", 0]]), [
        benchmark("sp500", [["2024-01-02", 0]]),
      ]),
      selected: ["sp500"],
    });

    expect(result.seriesColors).toEqual({
      "Optimal Portfolio": "#gold",
      "S&P 500": "#blue",
    });
  });

  it("ignores a selected id the response carries no data for", () => {
    const result = buildBenchmarkChartData({
      ...BASE,
      comparison: response(performance([["2024-01-02", 0]]), [
        benchmark("sp500", [["2024-01-02", 0]]),
      ]),
      selected: ["sp500", "gold"],
    });

    expect(result.series).toEqual(["Optimal Portfolio", "S&P 500"]);
  });

  it("returns nothing to draw when there is no comparison yet", () => {
    expect(
      buildBenchmarkChartData({ ...BASE, comparison: undefined, selected: ["sp500"] })
    ).toEqual({ data: [], series: [], seriesColors: {} });
  });

  it("returns nothing to draw when the portfolio could not be priced", () => {
    expect(
      buildBenchmarkChartData({
        ...BASE,
        comparison: response(null, [benchmark("sp500", [["2024-01-02", 0]])]),
        selected: ["sp500"],
      })
    ).toEqual({ data: [], series: [], seriesColors: {} });
  });

  it("returns nothing to draw when no benchmark is selected", () => {
    expect(
      buildBenchmarkChartData({
        ...BASE,
        comparison: response(performance([["2024-01-02", 0]]), []),
        selected: [],
      })
    ).toEqual({ data: [], series: [], seriesColors: {} });
  });
});
