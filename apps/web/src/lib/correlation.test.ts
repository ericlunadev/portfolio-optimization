import { describe, expect, it } from "vitest";
import { correlationFromCovariance, summarizeDiversification } from "./correlation";

describe("correlationFromCovariance", () => {
  it("puts ones on the diagonal", () => {
    const result = correlationFromCovariance([
      [0.04, 0.012],
      [0.012, 0.09],
    ]);

    expect(result[0][0]).toBeCloseTo(1, 10);
    expect(result[1][1]).toBeCloseTo(1, 10);
  });

  it("recovers the correlation the covariance was built from", () => {
    // cov(i, j) = vol_i * vol_j * rho, with vols of 20% and 30%.
    const rho = 0.42;
    const result = correlationFromCovariance([
      [0.2 * 0.2, 0.2 * 0.3 * rho],
      [0.2 * 0.3 * rho, 0.3 * 0.3],
    ]);

    expect(result[0][1]).toBeCloseTo(rho, 10);
    expect(result[1][0]).toBeCloseTo(rho, 10);
  });

  it("keeps negative covariances negative", () => {
    const result = correlationFromCovariance([
      [0.04, -0.03],
      [-0.03, 0.09],
    ]);

    expect(result[0][1]).toBeCloseTo(-0.5, 10);
  });

  it("clamps values that rounding pushed past the range", () => {
    const result = correlationFromCovariance([
      [0.04, 0.0400001],
      [0.0400001, 0.04],
    ]);

    expect(result[0][1]).toBe(1);
  });

  it("reports no correlation for an asset with no variance", () => {
    const result = correlationFromCovariance([
      [0, 0],
      [0, 0.09],
    ]);

    expect(result[0][1]).toBe(0);
    expect(result[0][0]).toBe(0);
    expect(result[1][1]).toBeCloseTo(1, 10);
  });

  it("handles a three-asset matrix symmetrically", () => {
    const covariance = [
      [0.04, 0.012, -0.006],
      [0.012, 0.09, 0.027],
      [-0.006, 0.027, 0.0225],
    ];

    const result = correlationFromCovariance(covariance);

    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        expect(result[i][j]).toBeCloseTo(result[j][i], 10);
      }
    }
    expect(result[0][1]).toBeCloseTo(0.2, 10);
    expect(result[0][2]).toBeCloseTo(-0.2, 10);
    expect(result[1][2]).toBeCloseTo(0.6, 10);
  });
});

describe("summarizeDiversification", () => {
  const correlation = [
    [1, 0.9, 0.1],
    [0.9, 1, 0.2],
    [0.1, 0.2, 1],
  ];

  it("weights each pair by the share of the portfolio it holds", () => {
    // Pairs: (0,1) 0.25·0.25, (0,2) 0.25·0.5, (1,2) 0.25·0.5.
    const summary = summarizeDiversification(correlation, [0.25, 0.25, 0.5]);
    const expected =
      (0.0625 * 0.9 + 0.125 * 0.1 + 0.125 * 0.2) / (0.0625 + 0.125 + 0.125);
    expect(summary?.averageCorrelation).toBeCloseTo(expected, 10);
  });

  it("ignores a pair the portfolio does not hold", () => {
    const summary = summarizeDiversification(correlation, [0.5, 0, 0.5]);
    expect(summary?.averageCorrelation).toBeCloseTo(0.1, 10);
    expect(summary?.level).toBe("high");
  });

  it("reads a tightly correlated pair as poorly diversified", () => {
    const summary = summarizeDiversification(correlation, [0.5, 0.5, 0]);
    expect(summary?.averageCorrelation).toBeCloseTo(0.9, 10);
    expect(summary?.level).toBe("low");
  });

  it("calls the middle band moderate", () => {
    const summary = summarizeDiversification(
      [
        [1, 0.45],
        [0.45, 1],
      ],
      [0.5, 0.5]
    );
    expect(summary?.level).toBe("moderate");
  });

  it("counts a short leg as exposure, not as an offset", () => {
    const summary = summarizeDiversification(correlation, [0.5, -0.5, 0]);
    expect(summary?.averageCorrelation).toBeCloseTo(0.9, 10);
  });

  it("returns null when there is no pair to average", () => {
    expect(summarizeDiversification([[1]], [1])).toBeNull();
    expect(summarizeDiversification(correlation, [1, 0, 0])).toBeNull();
  });
});
