import { describe, expect, it } from "vitest";
import { SimulationAsset } from "@/lib/api";
import { formatWeightLimits, toWeightBounds, validateAssetLimits } from "./asset-limits";

function asset(
  ticker: string,
  minWeight: number | null = null,
  maxWeight: number | null = null
): SimulationAsset {
  return { ticker, allocation: null, minWeight, maxWeight };
}

const CONTEXT = {
  assetLimits: true,
  targetPercent: 100,
  enforceFullInvestment: true,
  fallbackMaxPercent: 100,
};

describe("toWeightBounds", () => {
  it("returns nothing when limits are switched off", () => {
    expect(toWeightBounds([asset("AAPL", 10, 40)], false)).toBeUndefined();
  });

  it("returns nothing when no asset sets a limit", () => {
    expect(toWeightBounds([asset("AAPL"), asset("MSFT")], true)).toBeUndefined();
  });

  it("converts percentages to decimals and keeps nulls", () => {
    const bounds = toWeightBounds([asset("AAPL", 10, 40), asset("MSFT")], true);
    expect(bounds).toEqual({
      wMinPerAsset: [0.1, null],
      wMaxPerAsset: [0.4, null],
    });
  });

  it("skips rows with no ticker, so the arrays line up with the ticker list", () => {
    const bounds = toWeightBounds(
      [asset("AAPL", 10), asset("", 90), asset("MSFT", 20)],
      true
    );
    expect(bounds?.wMinPerAsset).toEqual([0.1, 0.2]);
  });
});

describe("validateAssetLimits", () => {
  it("accepts limits that bracket the target", () => {
    const assets = [asset("AAPL", 10, 60), asset("MSFT", 20, 70)];
    expect(validateAssetLimits(assets, CONTEXT)).toBeNull();
  });

  it("stays quiet when limits are switched off", () => {
    const assets = [asset("AAPL", 90), asset("MSFT", 90)];
    expect(validateAssetLimits(assets, { ...CONTEXT, assetLimits: false })).toBeNull();
  });

  it("rejects a minimum above its own maximum", () => {
    const assets = [asset("AAPL", 50, 20), asset("MSFT")];
    expect(validateAssetLimits(assets, CONTEXT)).toEqual({
      kind: "minAboveMax",
      ticker: "AAPL",
    });
  });

  it("rejects a limit outside 0-100", () => {
    expect(validateAssetLimits([asset("AAPL", -5)], CONTEXT)).toEqual({
      kind: "outOfRange",
      ticker: "AAPL",
    });
  });

  it("rejects minimums that add up past the capital to invest", () => {
    const assets = [asset("AAPL", 60), asset("MSFT", 60)];
    expect(validateAssetLimits(assets, CONTEXT)).toEqual({
      kind: "minTotalTooHigh",
      total: 120,
      target: 100,
    });
  });

  it("rejects maximums that fall short under full investment", () => {
    const assets = [asset("AAPL", null, 20), asset("MSFT", null, 30)];
    expect(validateAssetLimits(assets, CONTEXT)).toEqual({
      kind: "maxTotalTooLow",
      total: 50,
      target: 100,
    });
  });

  it("allows short maximums when the portfolio may hold cash", () => {
    const assets = [asset("AAPL", null, 20), asset("MSFT", null, 30)];
    expect(
      validateAssetLimits(assets, { ...CONTEXT, enforceFullInvestment: false })
    ).toBeNull();
  });

  it("counts the portfolio-wide cap for assets with no maximum of their own", () => {
    const assets = [asset("AAPL", 10), asset("MSFT", 10)];
    expect(
      validateAssetLimits(assets, { ...CONTEXT, fallbackMaxPercent: 40 })
    ).toEqual({ kind: "maxTotalTooLow", total: 80, target: 100 });
  });

  it("measures against the leveraged total, not a flat 100%", () => {
    const assets = [asset("AAPL", 70), asset("MSFT", 70)];
    expect(validateAssetLimits(assets, { ...CONTEXT, targetPercent: 150 })).toBeNull();
  });
});

describe("formatWeightLimits", () => {
  it("renders a two-sided range", () => {
    expect(formatWeightLimits(asset("AAPL", 10, 40))).toBe("10–40%");
  });

  it("renders one-sided limits", () => {
    expect(formatWeightLimits(asset("AAPL", 10))).toBe("≥10%");
    expect(formatWeightLimits(asset("AAPL", null, 40))).toBe("≤40%");
  });

  it("returns null when the asset has no limits", () => {
    expect(formatWeightLimits(asset("AAPL"))).toBeNull();
    expect(formatWeightLimits(undefined)).toBeNull();
  });

  it("drops trailing zeros from decimals", () => {
    expect(formatWeightLimits(asset("AAPL", 12.5, 33.333333))).toBe("12.5–33.33%");
  });

  it("uses ASCII comparisons for the PDF, which cannot draw the glyphs", () => {
    expect(formatWeightLimits(asset("AAPL", 10), { ascii: true })).toBe(">=10%");
    expect(formatWeightLimits(asset("AAPL", null, 40), { ascii: true })).toBe("<=40%");
    expect(formatWeightLimits(asset("AAPL", 10, 40), { ascii: true })).toBe("10-40%");
  });
});
