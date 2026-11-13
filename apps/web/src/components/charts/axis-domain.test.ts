import { describe, expect, it } from "vitest";
import { fitDomain } from "./axis-domain";

describe("fitDomain", () => {
  it("frames a frontier far from the origin instead of starting at zero", () => {
    // Peso-quoted equities: risk between 42% and 61%.
    const fitted = fitDomain([0.42, 0.47, 0.53, 0.61])!;

    expect(fitted.domain[0]).toBeGreaterThan(0.3);
    expect(fitted.domain[0]).toBeLessThanOrEqual(0.42);
    expect(fitted.domain[1]).toBeGreaterThanOrEqual(0.61);
    // The data should fill most of the axis, not a sliver of it.
    const [lo, hi] = fitted.domain;
    expect((0.61 - 0.42) / (hi - lo)).toBeGreaterThan(0.6);
  });

  it("returns round, evenly spaced ticks that span the domain", () => {
    const { domain, ticks } = fitDomain([0.42, 0.61])!;

    expect(ticks[0]).toBe(domain[0]);
    expect(ticks[ticks.length - 1]).toBe(domain[1]);
    expect(ticks).toEqual([0.4, 0.45, 0.5, 0.55, 0.6, 0.65]);
  });

  it("never pushes a non-negative series below zero", () => {
    const { domain } = fitDomain([0.001, 0.2])!;
    expect(domain[0]).toBe(0);
  });

  it("extends below zero when a value is negative", () => {
    const { domain } = fitDomain([-0.05, 0.12])!;
    expect(domain[0]).toBeLessThan(-0.05);
  });

  it("gives a single point a visible span", () => {
    const { domain } = fitDomain([0.3])!;
    expect(domain[0]).toBeLessThan(0.3);
    expect(domain[1]).toBeGreaterThan(0.3);
  });

  it("ignores non-finite values and returns null when nothing is left", () => {
    expect(fitDomain([])).toBeNull();
    expect(fitDomain([NaN, Infinity])).toBeNull();
    expect(fitDomain([NaN, 0.1, 0.2])).not.toBeNull();
  });
});
