// The sidebar and phone-header wordmark: a tenant's product name, shown once,
// with the accent placed by their short name. See `wordmark.ts` for the rules.

import { describe, expect, it } from "vitest";
import { DEFAULT_TENANT_CONFIG } from "./tenant-config";
import { wordmark } from "./wordmark";

/** What a reader sees: the two halves joined the way the components join them. */
function reads(mark: { accent: string; rest: string }): string {
  return [mark.accent, mark.rest].filter(Boolean).join(" ");
}

function occurrences(text: string, word: string): number {
  return text.toLowerCase().split(/\s+/).filter((token) => token === word.toLowerCase()).length;
}

describe("a short name that leads the product name", () => {
  it("accents the short name's words and never repeats them", () => {
    expect(wordmark("Acme Portfolio Lab", "Acme")).toEqual({ accent: "Acme", rest: "Portfolio Lab" });
    expect(wordmark("Borealis Allocator", "Borealis")).toEqual({ accent: "Borealis", rest: "Allocator" });
  });

  it("matches a multi-word short name word for word", () => {
    expect(wordmark("Borealis Wealth Allocator", "Borealis Wealth")).toEqual({
      accent: "Borealis Wealth",
      rest: "Allocator",
    });
  });

  it("ignores case, and keeps the product name's own casing", () => {
    expect(wordmark("Acme Portfolio Lab", "ACME")).toEqual({ accent: "Acme", rest: "Portfolio Lab" });
    expect(wordmark("ACME Portfolio Lab", "acme")).toEqual({ accent: "ACME", rest: "Portfolio Lab" });
  });

  it("does not match part of a word", () => {
    // "Ac" is not a word of "Acme Portfolio Lab", so nothing is split mid-word.
    expect(wordmark("Acme Portfolio Lab", "Ac")).toEqual({ accent: "Acme Portfolio Lab", rest: "" });
  });

  it("does not treat a differently accented word as the same one", () => {
    expect(wordmark("Gestión Patrimonial", "Gestion")).toEqual({ accent: "Gestión Patrimonial", rest: "" });
  });
});

describe("a short name equal to the product name", () => {
  it("renders the name once, all accent", () => {
    expect(wordmark("Acme", "Acme")).toEqual({ accent: "Acme", rest: "" });
    expect(wordmark("Borealis Allocator", "borealis allocator")).toEqual({ accent: "Borealis Allocator", rest: "" });
  });
});

describe("a short name that abbreviates the product name", () => {
  it("gives the default tenant its pre-whitelabel wordmark", () => {
    expect(wordmark("Optimización de Portafolio", "Optim.")).toEqual({ accent: "Optim.", rest: "Portafolio" });
  });

  it("is what the default brand renders when the API is unreachable", () => {
    const { productName, shortName } = DEFAULT_TENANT_CONFIG.brand;

    expect(reads(wordmark(productName, shortName))).toBe("Optim. Portafolio");
  });

  it("drops the particles joining the abbreviated word to a capitalised rest", () => {
    expect(wordmark("Portfolio of the Future", "Port.")).toEqual({ accent: "Port.", rest: "Future" });
    expect(wordmark("Optimization Lab", "Optim.")).toEqual({ accent: "Optim.", rest: "Lab" });
  });

  it("keeps every word of a name typed in sentence case, where particles cannot be told apart", () => {
    expect(wordmark("Optimización de portafolio", "Optim.")).toEqual({ accent: "Optim.", rest: "de portafolio" });
  });

  it("keeps a capitalised word straight after the abbreviation", () => {
    expect(wordmark("Optimización Global de Carteras", "Optim.")).toEqual({
      accent: "Optim.",
      rest: "Global de Carteras",
    });
  });

  it("matches the abbreviation's stem in any case", () => {
    expect(wordmark("Optimización de Portafolio", "OPTIM.")).toEqual({ accent: "OPTIM.", rest: "Portafolio" });
  });

  it("needs the period, a real stem and a word left to show", () => {
    // No period: an unrelated prefix, not an abbreviation.
    expect(wordmark("Optimización de Portafolio", "Optim")).toEqual({
      accent: "Optimización de Portafolio",
      rest: "",
    });
    // One letter says too little to stand for the word.
    expect(wordmark("Acme Portfolio Lab", "A.")).toEqual({ accent: "Acme Portfolio Lab", rest: "" });
    // Nothing after the abbreviated word: showing only "Optim." would hide the name.
    expect(wordmark("Optimización", "Optim.")).toEqual({ accent: "Optimización", rest: "" });
  });
});

describe("no usable short name", () => {
  it.each([
    ["empty", ""],
    ["whitespace", "   "],
    ["null", null],
    ["undefined", undefined],
  ])("accents the whole product name when the short name is %s", (_label, shortName) => {
    expect(wordmark("Acme Portfolio Lab", shortName)).toEqual({ accent: "Acme Portfolio Lab", rest: "" });
  });

  it("accents the whole product name rather than invent a split when the short name is unrelated", () => {
    expect(wordmark("Borealis Wealth Allocator", "BWA")).toEqual({
      accent: "Borealis Wealth Allocator",
      rest: "",
    });
  });

  it("collapses stray whitespace in the product name", () => {
    expect(wordmark("  Acme   Portfolio Lab ", "Acme")).toEqual({ accent: "Acme", rest: "Portfolio Lab" });
  });

  it("falls back to the short name, then to nothing, when there is no product name", () => {
    expect(wordmark("", "Acme")).toEqual({ accent: "Acme", rest: "" });
    expect(wordmark(null, null)).toEqual({ accent: "", rest: "" });
  });
});

describe("the name appears once", () => {
  it.each([
    ["Acme Portfolio Lab", "Acme", "Acme"],
    ["Borealis Allocator", "Borealis", "Borealis"],
    ["Optimización de Portafolio", "Optim.", "Portafolio"],
    ["Acme Portfolio Lab", "", "Acme"],
    ["Acme", "Acme", "Acme"],
    ["Acme Portfolio Lab", "ACME", "Acme"],
  ])("%j with short name %j shows %j once", (productName, shortName, word) => {
    expect(occurrences(reads(wordmark(productName, shortName)), word)).toBe(1);
  });
});
