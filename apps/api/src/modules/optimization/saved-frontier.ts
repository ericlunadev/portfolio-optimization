// The efficient frontier of a *saved* simulation, charged once per simulation
// and set of parameters rather than once per page view.
//
// **Why this exists.** The results page used to draw the frontier by posting the
// simulation's tickers to the metered `POST /efficient-frontier-tickers` every
// time it rendered, so reloading, reopening or returning to a saved simulation
// spent a credit each time. Creating one cost 2 (the optimization, then the
// frontier on first view); every view after that cost 1 more.
//
// **What it charges.** Exactly what creating a simulation cost before: the first
// frontier of a saved simulation spends 1 credit, and every later view of the
// same simulation with the same parameters replays that spend. Parameters that
// change — a re-run, which moves the end date, or any other PUT — are a new
// computation and spend again.
//
// **Why it cannot be replayed for other work.** Nothing about the computation
// comes from the request. The route loads the row by id, inside the caller's
// organization and read scope, and derives the frontier request from the row's
// stored `params` here. The replay key is written by the server and binds that
// simulation id to a digest of that derived request, so:
//
//   - a client cannot point a reopen at other tickers or dates: there is nowhere
//     to put them;
//   - changing the stored parameters changes the digest, and pays;
//   - another simulation, even with identical parameters, has its own key and
//     pays — so a second simulation is not made cheaper than the first;
//   - a client `Idempotency-Key` cannot collide with it: the metered routes
//     prefix those with `client:` (lib/billing/metering.ts), and this route
//     reads no header at all.
//
// **After a refund.** A failed computation is refunded by `reverseSpend`, which
// leaves the spend row in place. Replaying that row would make every later view
// of the simulation free for a frontier nobody paid for — and since
// `POST /api/simulations` stores whatever parameters it is given, "make the
// first attempt fail" would become a way to buy unlimited frontiers for
// nothing. So a refunded spend does not count as paid: the next view charges
// under the next attempt key, `…:retry-1`, and so on.

import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { findSpend, type SpendResult } from "../../lib/billing/spend.js";
import { meterRequest } from "../../lib/billing/metering.js";

/**
 * Per-asset weight bounds, aligned index-for-index with `tickers`. A `null`
 * entry falls back to the portfolio-wide `w_max`.
 */
const perAssetBoundSchema = z.array(z.number().min(-1).max(1).nullable()).optional();

/** The body of `POST /api/optimization/efficient-frontier-tickers`. */
export const frontierRequestSchema = z.object({
  tickers: z.array(z.string()),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  w_max: z.number().min(0).max(1).default(1.0),
  w_min_per_asset: perAssetBoundSchema,
  w_max_per_asset: perAssetBoundSchema,
  // Constraint toggles (for consistent frontier calculation)
  enforce_full_investment: z.boolean().default(true),
  allow_short_selling: z.boolean().default(false),
  max_leverage: z.number().min(1).max(3).default(1.0),
});

export type FrontierRequest = z.infer<typeof frontierRequestSchema>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMonth(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 12;
}

function isYear(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1900 && (value as number) <= 9999;
}

function percentToDecimal(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value / 100 : null;
}

/**
 * The frontier request the web results page builds from a simulation's `params`
 * (`components/MarkowitzResults.tsx`), rebuilt on the server from the stored row.
 *
 * `null` when the stored parameters cannot describe one — a row saved by a
 * client with another params shape, or one with no date range — so the route
 * refuses before anything is charged.
 */
export function frontierRequestFromSimulationParams(params: unknown): FrontierRequest | null {
  if (!isRecord(params)) return null;

  const { tickers, dateRange } = params;
  if (!Array.isArray(tickers) || tickers.length < 2 || !tickers.every((t) => typeof t === "string")) {
    return null;
  }

  if (!isRecord(dateRange)) return null;
  const { startMonth, startYear, endMonth, endYear } = dateRange;
  if (!isMonth(startMonth) || !isYear(startYear) || !isMonth(endMonth) || !isYear(endYear)) {
    return null;
  }

  // The first of the start month through the last day of the end month.
  const start_date = `${startYear}-${String(startMonth).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(endYear, endMonth, 0)).getUTCDate();
  const end_date = `${endYear}-${String(endMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  // `lib/asset-limits.ts#toWeightBounds`: limits apply only when switched on and
  // at least one row sets one, and they align with the rows that have a ticker.
  let w_min_per_asset: (number | null)[] | undefined;
  let w_max_per_asset: (number | null)[] | undefined;
  if (params.assetLimits === true && Array.isArray(params.assets)) {
    const rows = params.assets.filter((asset): asset is Record<string, unknown> =>
      isRecord(asset) && typeof asset.ticker === "string" && asset.ticker !== ""
    );
    const mins = rows.map((asset) => percentToDecimal(asset.minWeight));
    const maxes = rows.map((asset) => percentToDecimal(asset.maxWeight));
    if (mins.some((v) => v !== null) || maxes.some((v) => v !== null)) {
      w_min_per_asset = mins;
      w_max_per_asset = maxes;
    }
  }

  const parsed = frontierRequestSchema.safeParse({
    tickers,
    start_date,
    end_date,
    w_max: params.assetConstraints === true ? params.wMax : 1.0,
    w_min_per_asset,
    w_max_per_asset,
    enforce_full_investment: typeof params.enforceFullInvestment === "boolean" ? params.enforceFullInvestment : true,
    allow_short_selling: typeof params.allowShortSelling === "boolean" ? params.allowShortSelling : false,
    max_leverage: params.useLeverage === true ? params.maxLeverage : 1.0,
  });

  return parsed.success ? parsed.data : null;
}

/**
 * The replay key for one simulation's frontier under one set of parameters.
 * Fields are listed explicitly so the digest does not depend on property order.
 */
export function savedFrontierIdempotencyKey(simulationId: string, request: FrontierRequest): string {
  const canonical = JSON.stringify([
    request.tickers,
    request.start_date ?? null,
    request.end_date ?? null,
    request.w_max,
    request.w_min_per_asset ?? null,
    request.w_max_per_asset ?? null,
    request.enforce_full_investment,
    request.allow_short_selling,
    request.max_leverage,
  ]);
  const digest = createHash("sha256").update(canonical).digest("hex");
  return `frontier:${simulationId}:${digest}`;
}

/** Past this many refunded attempts, stop looking for the next key and charge under a unique one. */
const MAX_REFUNDED_ATTEMPTS = 20;

/**
 * Spends for a saved simulation's frontier, or replays the spend already made
 * for it.
 *
 * `replayed` tells the caller whether this request paid. Only a request that
 * paid may refund on failure: refunding a replayed spend would hand back the
 * credit for the view that succeeded earlier.
 */
export async function spendForSavedFrontier(opts: {
  organizationId: string;
  user: { id: string };
  simulationId: string;
  request: FrontierRequest;
}): Promise<{ spend: SpendResult; replayed: boolean }> {
  const { organizationId, user, simulationId, request } = opts;
  const baseKey = savedFrontierIdempotencyKey(simulationId, request);

  for (let attempt = 0; attempt < MAX_REFUNDED_ATTEMPTS; attempt++) {
    const idempotencyKey = attempt === 0 ? baseKey : `${baseKey}:retry-${attempt}`;
    const existing = await findSpend(organizationId, idempotencyKey);

    if (!existing) {
      const spend = await meterRequest({ organizationId, user, cost: 1, idempotencyKey });
      return { spend, replayed: false };
    }
    if (!existing.reversed) {
      return { spend: existing, replayed: true };
    }
    // Refunded: that attempt paid for nothing. Try the next key.
  }

  const spend = await meterRequest({
    organizationId,
    user,
    cost: 1,
    idempotencyKey: `${baseKey}:retry-${randomUUID()}`,
  });
  return { spend, replayed: false };
}
