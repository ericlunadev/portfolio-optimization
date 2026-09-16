import { describe, expect, it } from "vitest";
import { correlationFromCovariance } from "./correlation";

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
