import { describe, expect, it } from "vitest";
import { resolveDisclaimerText } from "@/lib/disclaimer";

const DEFAULT = "Result of a simulation over historical data.";

describe("resolveDisclaimerText", () => {
  it("uses the tenant's wording when they set one", () => {
    expect(resolveDisclaimerText("Approved by our compliance desk.", DEFAULT)).toBe(
      "Approved by our compliance desk."
    );
  });

  it("keeps the tenant's own leading and trailing content intact", () => {
    expect(resolveDisclaimerText("  Two sentences. Both theirs.  ", DEFAULT)).toBe(
      "Two sentences. Both theirs."
    );
  });

  // The presence of a disclaimer is not tenant-configurable: every blank shape
  // the column can hold has to land on our copy rather than on nothing.
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["empty", ""],
    ["whitespace", "   \n\t "],
  ])("falls back to our default when the tenant text is %s", (_label, value) => {
    expect(resolveDisclaimerText(value, DEFAULT)).toBe(DEFAULT);
  });
});
