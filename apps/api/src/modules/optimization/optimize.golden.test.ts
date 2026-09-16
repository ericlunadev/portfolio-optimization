import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PricePoint } from "../../lib/yahoo.js";
import { OPTIMIZATION_STRATEGIES } from "../../lib/math/strategies.js";

/**
 * Golden tests for `POST /api/optimization/optimize`.
 *
 * The snapshots were recorded against the route while the optimization logic
 * still lived inline in the handler, before it moved to `service.ts`. They pin
 * the response byte-for-byte, so the extraction (and anything later that
 * touches the service) cannot silently change what a user is shown.
 */

const { fetchTickerPrices, meterRequest, reverseSpendOnError } = vi.hoisted(() => ({
  fetchTickerPrices: vi.fn(),
  meterRequest: vi.fn(),
  reverseSpendOnError: vi.fn(),
}));

vi.mock("../../lib/yahoo.js", () => ({ fetchTickerPrices }));
vi.mock("../../db/index.js", () => ({ db: {} }));
vi.mock("../../middleware/auth.js", () => ({
  authMiddleware: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { id: "user-1" });
    await next();
  },
}));
vi.mock("../../lib/billing/metering.js", () => ({
  meterRequest,
  reverseSpendOnError,
  newIdempotencyKey: () => "key",
}));

const { default: optimization } = await import("./routes.js");
const { optimizeRequestSchema, runOptimization } = await import("./service.js");
const { MissingStrategyTargetError } = await import("../../lib/math/run-strategy.js");

const TICKERS = ["AAA", "BBB", "CCC"];

/** A deterministic daily price history per ticker, different drift and noise each. */
function syntheticPrices(): Map<string, PricePoint[]> {
  let seed = 11;
  const next = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648 - 0.5;
  };
  const drift = [0.0002, 0.0004, 0.0007];
  const noise = [0.006, 0.012, 0.022];
  const start = Date.UTC(2020, 0, 1);

  return new Map(
    TICKERS.map((ticker, i) => {
      let close = 100;
      const points: PricePoint[] = [];
      for (let day = 0; day < 500; day++) {
        close *= Math.exp(drift[i] + noise[i] * next());
        points.push({
          date: new Date(start + day * 86_400_000).toISOString().slice(0, 10),
          close,
        });
      }
      return [ticker, points] as const;
    })
  );
}

async function optimize(body: Record<string, unknown>) {
  const res = await optimization.request("/optimize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tickers: TICKERS, ...body }),
  });
  const text = await res.text();
  return { status: res.status, body: res.headers.get("content-type")?.includes("json") ? JSON.parse(text) : text };
}

beforeEach(() => {
  fetchTickerPrices.mockReset().mockImplementation(async () => syntheticPrices());
  meterRequest.mockReset().mockResolvedValue({ ledgerId: "ledger-1", balanceAfter: 9 });
  reverseSpendOnError.mockReset();
});

const BASE = {
  risk_free_rate: 0.02,
  target_return: 0.1,
  target_risk: 0.15,
  start_date: "2020-01-01",
  end_date: "2021-05-31",
};

describe("POST /optimize golden output", () => {
  it.each(OPTIMIZATION_STRATEGIES)("matches the recorded response for %s", async (strategy) => {
    const { status, body } = await optimize({ ...BASE, strategy });
    expect(status).toBe(200);
    expect(body).toMatchSnapshot();
  });

  it.each(OPTIMIZATION_STRATEGIES)(
    "matches the recorded response for %s with bounds, shorting and leverage",
    async (strategy) => {
      const { status, body } = await optimize({
        ...BASE,
        strategy,
        w_max: 0.8,
        w_min_per_asset: [0.05, null, null],
        w_max_per_asset: [null, 0.6, null],
        allow_short_selling: true,
        max_leverage: 1.5,
        cvar_confidence: 0.9,
        view_confidence: 0.3,
      });
      expect(status).toBe(200);
      expect(body).toMatchSnapshot();
    }
  );

  it("rejects a target strategy without its target before charging", async () => {
    const { status, body } = await optimize({ strategy: "target-risk" });
    expect(status).toBe(400);
    expect(body.error).toBe("missing_strategy_target");
    expect(meterRequest).not.toHaveBeenCalled();
  });

  it("refunds the credit when the computation throws", async () => {
    fetchTickerPrices.mockRejectedValueOnce(new Error("yahoo down"));
    const { status } = await optimize({ ...BASE, strategy: "max-sharpe" });
    expect(status).toBe(500);
    expect(reverseSpendOnError).toHaveBeenCalledWith(
      { ledgerId: "ledger-1", balanceAfter: 9 },
      "optimize_failed"
    );
  });
});

describe("runOptimization", () => {
  it.each(OPTIMIZATION_STRATEGIES)("returns exactly what the route responds with for %s", async (strategy) => {
    const body = { tickers: TICKERS, ...BASE, strategy };
    const { body: viaRoute } = await optimize(body);
    const direct = await runOptimization(optimizeRequestSchema.parse(body));
    // JSON round-trip: the route's response went through c.json().
    expect(JSON.parse(JSON.stringify(direct))).toEqual(viaRoute);
  });

  it("throws a typed error, not an HTTP response, for a missing target", async () => {
    await expect(
      runOptimization(optimizeRequestSchema.parse({ tickers: TICKERS, strategy: "target-return" }))
    ).rejects.toBeInstanceOf(MissingStrategyTargetError);
  });
});
