// PLAN Task 2.7 — the crypto rail is hidden unless the tenant has it on.
//
// The server refuses the rail as well (see the API's crypto-rail suite); what is
// covered here is the presentation half, and specifically which way it guesses
// while the answer is still in flight.

import { describe, expect, it } from "vitest";
import { isRailAvailable, RAILS_FALLBACK, resolveRails } from "./rails";

describe("resolveRails", () => {
  it("falls back to card only before the server has answered", () => {
    expect(resolveRails(undefined)).toEqual(["stripe"]);
  });

  it("treats an empty list as the fallback rather than as no way to pay", () => {
    expect(resolveRails({ rails: [] })).toEqual(RAILS_FALLBACK);
  });

  it("uses what the organization actually has", () => {
    expect(resolveRails({ rails: ["stripe", "coinbase_commerce"] })).toEqual([
      "stripe",
      "coinbase_commerce",
    ]);
  });
});

describe("isRailAvailable", () => {
  it("hides the crypto tab for an organization with the rail off", () => {
    expect(isRailAvailable(resolveRails({ rails: ["stripe"] }), "coinbase_commerce")).toBe(false);
  });

  it("hides it while the answer is still loading", () => {
    expect(isRailAvailable(resolveRails(undefined), "coinbase_commerce")).toBe(false);
  });

  it("shows it for an organization that opted in", () => {
    expect(
      isRailAvailable(resolveRails({ rails: ["stripe", "coinbase_commerce"] }), "coinbase_commerce")
    ).toBe(true);
  });

  it("never hides the card rail", () => {
    expect(isRailAvailable(resolveRails(undefined), "stripe")).toBe(true);
    expect(isRailAvailable(resolveRails({ rails: ["stripe"] }), "stripe")).toBe(true);
  });
});
