// Error bodies are what the web shows the user when an optimization is refused,
// and the 400 log line is what an operator reads in Render to learn why. Both
// are driven through the real app so the middleware order is the production one.

import { afterEach, describe, expect, it, vi } from "vitest";
import { asUser, seedOrg, seedUser } from "../test/factories.js";

const BODY = {
  strategy: "max-sharpe",
  start_date: "2020-01-01",
  end_date: "2023-12-31",
};

describe("400 responses from the optimizer", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns a zod failure as JSON naming the field, and logs it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const analyst = await seedUser({ organizationId: (await seedOrg()).id });

    const response = await asUser(analyst)("/api/optimization/optimize", {
      method: "POST",
      json: { ...BODY, tickers: ["SPY", "AGG"], risk_free_rate: -0.01 },
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      success: boolean;
      error: { issues: { path: unknown[] }[] };
    };
    // The shape apps/web/src/lib/optimize-error.ts reads.
    expect(body.success).toBe(false);
    expect(body.error.issues[0].path).toEqual(["risk_free_rate"]);

    const logged = warn.mock.calls.map((call) => String(call[0])).join("\n");
    expect(logged).toContain("[400] POST /api/optimization/optimize");
    expect(logged).toContain("risk_free_rate");
  });

  it("returns a thrown HTTPException as JSON, not Hono's default plain text", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const org = await seedOrg({ fundAllowlist: JSON.stringify(["SPY", "AGG"]) });
    const analyst = await seedUser({ organizationId: org.id });

    const response = await asUser(analyst)("/api/optimization/optimize", {
      method: "POST",
      json: { ...BODY, tickers: ["SPY", "TSLA"] },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "INSTRUMENT_NOT_ALLOWED: TSLA" });
  });

  it("logs the bounds verdict an infeasible request gets", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const analyst = await seedUser({ organizationId: (await seedOrg()).id });

    const response = await asUser(analyst)("/api/optimization/optimize", {
      method: "POST",
      json: { ...BODY, tickers: ["SPY", "AGG"], w_max: 0.3 },
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toBe("max_weights_below_total");
    expect(warn.mock.calls.map((call) => String(call[0])).join("\n")).toContain(
      "max_weights_below_total"
    );
  });
});
