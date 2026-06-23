import { describe, it, expect } from "vitest";
import { cn, formatPercent, formatNumber, formatUsdCents } from "./utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });

  it("dedupes conflicting tailwind classes, keeping the last", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("drops falsy values", () => {
    expect(cn("text-sm", false, undefined, null, "font-bold")).toBe("text-sm font-bold");
  });
});

describe("formatPercent", () => {
  it("formats a ratio as a percentage with two decimals by default", () => {
    expect(formatPercent(0.1234)).toBe("12.34%");
  });

  it("respects a custom decimal count", () => {
    expect(formatPercent(0.5, 0)).toBe("50%");
  });
});

describe("formatNumber", () => {
  it("fixes to two decimals by default", () => {
    expect(formatNumber(3.14159)).toBe("3.14");
  });

  it("respects a custom decimal count", () => {
    expect(formatNumber(3.14159, 4)).toBe("3.1416");
  });
});

describe("formatUsdCents", () => {
  it("converts cents to a USD string", () => {
    expect(formatUsdCents(12345)).toBe("$123.45 USD");
  });
});
