import { describe, it, expect } from "vitest";
import {
  BENCHMARKS,
  EQUAL_WEIGHT_ID,
  benchmarkTickers,
  buildWeightedSeries,
  customBenchmarkDefinition,
  customBenchmarkId,
  findBenchmark,
  parseCustomBenchmarkId,
  resolveBenchmarkComponents,
} from "./benchmarks.js";
import type { PricePoint } from "./yahoo.js";

function prices(entries: [string, number][]): PricePoint[] {
  return entries.map(([date, close]) => ({ date, close }));
}

describe("benchmark catalog", () => {
  it("has unique ids", () => {
    const ids = BENCHMARKS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every fixed benchmark at least one component with positive weight", () => {
    // The equal-weight benchmark is the one entry with no fixed legs — it
    // borrows the simulation's own assets, so it is exercised separately.
    for (const benchmark of BENCHMARKS.filter((b) => b.id !== EQUAL_WEIGHT_ID)) {
      expect(benchmark.components.length).toBeGreaterThan(0);
      const total = benchmark.components.reduce((sum, c) => sum + c.weight, 0);
      expect(total).toBeGreaterThan(0);
    }
  });

  it("looks a benchmark up by id", () => {
    expect(findBenchmark("sp500")?.components[0].ticker).toBe("^GSPC");
    expect(findBenchmark("not-a-benchmark")).toBeUndefined();
  });

  it("spreads the portfolio's own assets evenly for the equal-weight benchmark", () => {
    const definition = findBenchmark(EQUAL_WEIGHT_ID)!;
    const components = resolveBenchmarkComponents(definition, ["AAPL", "MSFT", "KO", "JNJ"]);

    expect(components).toEqual([
      { ticker: "AAPL", weight: 0.25 },
      { ticker: "MSFT", weight: 0.25 },
      { ticker: "KO", weight: 0.25 },
      { ticker: "JNJ", weight: 0.25 },
    ]);
  });

  it("counts a repeated portfolio asset once when equal-weighting", () => {
    const definition = findBenchmark(EQUAL_WEIGHT_ID)!;
    const components = resolveBenchmarkComponents(definition, ["AAPL", "AAPL", "MSFT"]);

    expect(components.map((c) => c.ticker)).toEqual(["AAPL", "MSFT"]);
    expect(components.every((c) => c.weight === 0.5)).toBe(true);
  });

  it("resolves an empty equal-weight benchmark to no legs at all", () => {
    const definition = findBenchmark(EQUAL_WEIGHT_ID)!;
    expect(resolveBenchmarkComponents(definition, [])).toEqual([]);
  });

  it("leaves a fixed benchmark's legs alone when resolving", () => {
    const definition = findBenchmark("classic-60-40")!;
    expect(resolveBenchmarkComponents(definition, ["AAPL", "MSFT"])).toEqual(
      definition.components
    );
  });

  it("collects the symbols to fetch without repeating shared ones", () => {
    const tickers = benchmarkTickers([
      findBenchmark("classic-60-40")!,
      findBenchmark("us-bonds")!,
    ]);
    // AGG is a leg of 60/40 and a benchmark in its own right.
    expect(tickers).toEqual(["SPY", "AGG"]);
  });
});

describe("buildWeightedSeries", () => {
  it("tracks a single index as its cumulative return from the first date", () => {
    const series = buildWeightedSeries(
      [{ ticker: "^GSPC", weight: 1 }],
      new Map([
        [
          "^GSPC",
          prices([
            ["2024-01-02", 100],
            ["2024-01-03", 110],
            ["2024-01-04", 121],
          ]),
        ],
      ])
    );

    expect(series).not.toBeNull();
    expect(series!.points).toEqual([
      { date: "2024-01-02", value: 0 },
      { date: "2024-01-03", value: expect.closeTo(0.1, 10) },
      { date: "2024-01-04", value: expect.closeTo(0.21, 10) },
    ]);
    expect(series!.totalReturn).toBeCloseTo(0.21, 10);
  });

  it("blends legs by weight and rebalances daily", () => {
    // Leg A doubles then halves back; leg B is flat. A 50/50 daily-rebalanced
    // mix gains 50% then loses 25%, ending below where it started.
    const series = buildWeightedSeries(
      [
        { ticker: "A", weight: 0.5 },
        { ticker: "B", weight: 0.5 },
      ],
      new Map([
        [
          "A",
          prices([
            ["2024-01-02", 100],
            ["2024-01-03", 200],
            ["2024-01-04", 100],
          ]),
        ],
        [
          "B",
          prices([
            ["2024-01-02", 50],
            ["2024-01-03", 50],
            ["2024-01-04", 50],
          ]),
        ],
      ])
    );

    expect(series!.points[1].value).toBeCloseTo(0.5, 10);
    expect(series!.points[2].value).toBeCloseTo(0.125, 10);
    expect(series!.totalReturn).toBeCloseTo(0.125, 10);
  });

  it("holds the shortfall of a partly invested basket in cash", () => {
    // 40% in an asset that gains 20% earns 8%; the idle 60% earns nothing.
    const series = buildWeightedSeries(
      [{ ticker: "A", weight: 0.4 }],
      new Map([
        [
          "A",
          prices([
            ["2024-01-02", 100],
            ["2024-01-03", 120],
          ]),
        ],
      ])
    );

    expect(series!.totalReturn).toBeCloseTo(0.08, 10);
  });

  it("treats weights summing above one as leverage", () => {
    const series = buildWeightedSeries(
      [{ ticker: "A", weight: 1.5 }],
      new Map([
        [
          "A",
          prices([
            ["2024-01-02", 100],
            ["2024-01-03", 110],
          ]),
        ],
      ])
    );

    expect(series!.totalReturn).toBeCloseTo(0.15, 10);
  });

  it("uses only the dates every leg has a price for", () => {
    const series = buildWeightedSeries(
      [
        { ticker: "A", weight: 0.5 },
        { ticker: "B", weight: 0.5 },
      ],
      new Map([
        [
          "A",
          prices([
            ["2024-01-02", 100],
            ["2024-01-03", 110],
            ["2024-01-04", 120],
          ]),
        ],
        [
          // B did not trade on the 3rd, so that date drops out entirely.
          "B",
          prices([
            ["2024-01-02", 100],
            ["2024-01-04", 100],
          ]),
        ],
      ])
    );

    expect(series!.points.map((p) => p.date)).toEqual([
      "2024-01-02",
      "2024-01-04",
    ]);
    expect(series!.totalReturn).toBeCloseTo(0.1, 10);
  });

  it("reports the deepest peak-to-trough fall, not the last one", () => {
    const series = buildWeightedSeries(
      [{ ticker: "A", weight: 1 }],
      new Map([
        [
          "A",
          prices([
            ["2024-01-02", 100],
            ["2024-01-03", 50],
            ["2024-01-04", 100],
            ["2024-01-05", 90],
          ]),
        ],
      ])
    );

    expect(series!.maxDrawdown).toBeCloseTo(-0.5, 10);
  });

  it("annualizes return and volatility from daily log returns", () => {
    // A perfectly steady 0.1%/day climb: zero volatility, and a return of
    // ln(1.001) x 252 annualized.
    const entries: [string, number][] = [];
    let close = 100;
    for (let day = 1; day <= 30; day++) {
      entries.push([`2024-01-${String(day).padStart(2, "0")}`, close]);
      close *= 1.001;
    }

    const series = buildWeightedSeries(
      [{ ticker: "A", weight: 1 }],
      new Map([["A", prices(entries)]])
    );

    expect(series!.volatility).toBeCloseTo(0, 10);
    expect(series!.expectedReturn).toBeCloseTo(Math.log(1.001) * 252, 10);
    // With no volatility there is nothing to divide by, so Sharpe stays 0.
    expect(series!.sharpeRatio).toBe(0);
    expect(series!.maxDrawdown).toBe(0);
  });

  it("subtracts the risk-free rate from the Sharpe numerator", () => {
    const pricesByTicker = new Map([
      [
        "A",
        prices([
          ["2024-01-02", 100],
          ["2024-01-03", 105],
          ["2024-01-04", 103],
          ["2024-01-05", 108],
        ]),
      ],
    ]);
    const components = [{ ticker: "A", weight: 1 }];

    const withoutRate = buildWeightedSeries(components, pricesByTicker, 0)!;
    const withRate = buildWeightedSeries(components, pricesByTicker, 0.04)!;

    expect(withRate.sharpeRatio).toBeCloseTo(
      withoutRate.sharpeRatio - 0.04 / withoutRate.volatility,
      10
    );
  });

  it("returns null when a leg has no usable prices", () => {
    expect(
      buildWeightedSeries(
        [{ ticker: "A", weight: 1 }],
        new Map([["A", prices([["2024-01-02", 100]])]])
      )
    ).toBeNull();

    expect(buildWeightedSeries([{ ticker: "A", weight: 1 }], new Map())).toBeNull();
  });

  it("returns null when the legs share fewer than two dates", () => {
    expect(
      buildWeightedSeries(
        [
          { ticker: "A", weight: 0.5 },
          { ticker: "B", weight: 0.5 },
        ],
        new Map([
          [
            "A",
            prices([
              ["2024-01-02", 100],
              ["2024-01-03", 110],
            ]),
          ],
          [
            "B",
            prices([
              ["2024-01-04", 100],
              ["2024-01-05", 110],
            ]),
          ],
        ])
      )
    ).toBeNull();
  });
});

describe("custom benchmarks", () => {
  it("namespaces ids so they cannot collide with the catalog", () => {
    const id = customBenchmarkId("abc-123");
    expect(parseCustomBenchmarkId(id)).toBe("abc-123");
    expect(findBenchmark(id)).toBeUndefined();
  });

  it("does not read a catalog id as a custom one", () => {
    expect(parseCustomBenchmarkId("sp500")).toBeNull();
  });

  it("builds a definition from a stored row", () => {
    const definition = customBenchmarkDefinition({
      id: "abc-123",
      name: "My blend",
      components: JSON.stringify([
        { ticker: "SPY", weight: 0.7 },
        { ticker: "GLD", weight: 0.3 },
      ]),
    });

    expect(definition).toEqual({
      id: "custom:abc-123",
      category: "custom",
      name: "My blend",
      components: [
        { ticker: "SPY", weight: 0.7 },
        { ticker: "GLD", weight: 0.3 },
      ],
    });
  });

  it("keeps its own legs when resolved against a portfolio", () => {
    const definition = customBenchmarkDefinition({
      id: "abc-123",
      name: "My blend",
      components: JSON.stringify([{ ticker: "SPY", weight: 1 }]),
    })!;

    expect(resolveBenchmarkComponents(definition, ["AAPL", "MSFT"])).toEqual([
      { ticker: "SPY", weight: 1 },
    ]);
  });

  it("rejects a row whose stored legs are unusable", () => {
    const row = { id: "abc-123", name: "Broken" };

    expect(customBenchmarkDefinition({ ...row, components: "not json" })).toBeNull();
    expect(customBenchmarkDefinition({ ...row, components: "{}" })).toBeNull();
    expect(customBenchmarkDefinition({ ...row, components: "[]" })).toBeNull();
    expect(
      customBenchmarkDefinition({ ...row, components: JSON.stringify([{ ticker: "SPY" }]) })
    ).toBeNull();
    expect(
      customBenchmarkDefinition({
        ...row,
        components: JSON.stringify([{ ticker: "SPY", weight: "1" }]),
      })
    ).toBeNull();
  });
});
