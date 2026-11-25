import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { describeOptimizeError } from "@/lib/optimize-error";

function badRequest(body: Record<string, unknown>): ApiError {
  const code = typeof body.error === "string" ? body.error : undefined;
  return new ApiError(400, "Bad Request", code, body);
}

describe("describeOptimizeError", () => {
  it("maps each bounds code to its own message", () => {
    expect(describeOptimizeError(badRequest({ error: "max_weights_below_total" })).key).toBe(
      "errorMaxWeightsBelowTotal"
    );
    expect(describeOptimizeError(badRequest({ error: "missing_strategy_target" })).key).toBe(
      "errorMissingStrategyTarget"
    );
  });

  it("lists the tickers a tenant allowlist refused", () => {
    expect(
      describeOptimizeError(badRequest({ error: "INSTRUMENT_NOT_ALLOWED: YPF, GGAL" }))
    ).toEqual({ key: "errorInstrumentNotAllowed", values: { tickers: "YPF, GGAL" } });
  });

  it("names the fields a zod validation failure rejected", () => {
    const body = {
      success: false,
      error: {
        name: "ZodError",
        issues: [
          { path: ["risk_free_rate"], message: "Expected number, received null" },
          { path: ["w_max_per_asset", 2], message: "Number must be less than or equal to 1" },
        ],
      },
    };
    expect(describeOptimizeError(badRequest(body))).toEqual({
      key: "errorInvalidParams",
      values: { fields: "risk_free_rate, w_max_per_asset" },
    });
  });

  it("falls back to a generic message plus the raw code for an unknown 400", () => {
    expect(describeOptimizeError(badRequest({ error: "something_new" }))).toEqual({
      key: "errorBadRequest",
      code: "something_new",
    });
  });

  it("keeps the generic message for server and network errors", () => {
    expect(describeOptimizeError(new ApiError(500, "boom")).key).toBe("errorOptimize");
    expect(describeOptimizeError(new TypeError("fetch failed")).key).toBe("errorOptimize");
  });
});
