import { z } from "zod";
import { OPTIMIZATION_STRATEGIES, type OptimizationStrategy } from "../../lib/math/strategies.js";
import {
  optimizeParamsError,
  optimizeRequestSchema,
  type OptimizeParams,
} from "../optimization/service.js";
import { localDateOf } from "./next-run.js";

/**
 * Replaying a saved simulation on the server.
 *
 * `simulations.params` is opaque JSON. The web app writes camelCase
 * `SimulationParams` with a `dateRange` object; the mobile app writes the
 * snake_case optimize request with flat date strings and no `dateRange`. Only
 * the web shape can be replayed with a moved end date, so this schema is the
 * gate: schedules refuse anything else at creation, and the runner skips it.
 *
 * `bumpEndDate` and `toOptimizeParams` mirror `useRerunSimulation` in
 * `apps/web/src/hooks/useSimulations.ts` field for field, so a scheduled re-run
 * and a manual one can never compute different portfolios. Change them together.
 */

/** Which strategies read which optional input — `OPTIMIZATION_STRATEGIES` in the web `api.ts`. */
const STRATEGY_PARAMS: Record<
  OptimizationStrategy,
  ("risk-free-rate" | "target-return" | "target-risk" | "cvar-confidence" | "view-confidence")[]
> = {
  "max-sharpe": ["risk-free-rate"],
  "min-risk": [],
  "max-return": [],
  "target-return": ["target-return"],
  "target-risk": ["target-risk"],
  "knee-point": [],
  "risk-parity": [],
  "black-litterman": ["risk-free-rate", "view-confidence"],
  hrp: [],
  "max-diversification": [],
  cvar: ["cvar-confidence"],
  "equal-weight": [],
};

function usesParam(strategy: OptimizationStrategy, param: (typeof STRATEGY_PARAMS)[OptimizationStrategy][number]) {
  return STRATEGY_PARAMS[strategy].includes(param);
}

const month = z.number().int().min(1).max(12);
const year = z.number().int().min(1900).max(3000);

export const replayableParamsSchema = z
  .object({
    tickers: z.array(z.string()).min(1),
    assets: z.array(
      z
        .object({
          ticker: z.string(),
          minWeight: z.number().nullable().optional(),
          maxWeight: z.number().nullable().optional(),
        })
        .passthrough()
    ),
    dateRange: z.object({
      startMonth: month,
      startYear: year,
      endMonth: month,
      endYear: year,
    }),
    strategy: z.enum(OPTIMIZATION_STRATEGIES),
    targetReturn: z.number().optional(),
    targetRisk: z.number().optional(),
    cvarConfidence: z.number().optional(),
    viewConfidence: z.number().optional(),
    riskFreeRate: z.number(),
    enforceFullInvestment: z.boolean().optional(),
    allowShortSelling: z.boolean().optional(),
    useLeverage: z.boolean(),
    maxLeverage: z.number(),
    assetConstraints: z.boolean(),
    wMax: z.number(),
    assetLimits: z.boolean().optional(),
  })
  // Keep everything else (showFrontier, benchmarks…) so writing the bumped
  // params back does not strip what the web app stored.
  .passthrough();

export type ReplayableParams = z.infer<typeof replayableParamsSchema>;

/** The saved params with the end month moved to the current month in `timezone`. */
export function bumpEndDate(params: ReplayableParams, now: Date, timezone: string): ReplayableParams {
  const today = localDateOf(now, timezone);
  return {
    ...params,
    dateRange: { ...params.dateRange, endMonth: today.month, endYear: today.year },
  };
}

function toDecimal(percent: number | null | undefined): number | null {
  return typeof percent === "number" && Number.isFinite(percent) ? percent / 100 : null;
}

/** `toWeightBounds` in `apps/web/src/lib/asset-limits.ts`. */
function toWeightBounds(params: ReplayableParams) {
  if (!params.assetLimits) return undefined;
  const rows = params.assets.filter((a) => a.ticker);
  const wMinPerAsset = rows.map((a) => toDecimal(a.minWeight));
  const wMaxPerAsset = rows.map((a) => toDecimal(a.maxWeight));
  const hasAny = wMinPerAsset.some((v) => v !== null) || wMaxPerAsset.some((v) => v !== null);
  return hasAny ? { wMinPerAsset, wMaxPerAsset } : undefined;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The optimize request a (bumped) simulation replays as. */
export function toOptimizeParams(params: ReplayableParams): OptimizeParams {
  const { dateRange, strategy } = params;
  const startDate = `${dateRange.startYear}-${pad(dateRange.startMonth)}-01`;
  const lastDay = new Date(Date.UTC(dateRange.endYear, dateRange.endMonth, 0)).getUTCDate();
  const endDate = `${dateRange.endYear}-${pad(dateRange.endMonth)}-${pad(lastDay)}`;
  const bounds = toWeightBounds(params);

  // Parsed rather than built directly, so the zod defaults the route applies to
  // an omitted field (cvar 0.95, view 0.5…) apply here too.
  return optimizeRequestSchema.parse({
    tickers: params.tickers,
    strategy,
    w_max: params.assetConstraints ? params.wMax : 1,
    w_min_per_asset: bounds?.wMinPerAsset,
    w_max_per_asset: bounds?.wMaxPerAsset,
    risk_free_rate: usesParam(strategy, "risk-free-rate") ? params.riskFreeRate : 0,
    target_return: usesParam(strategy, "target-return") ? params.targetReturn : undefined,
    target_risk: usesParam(strategy, "target-risk") ? params.targetRisk : undefined,
    cvar_confidence: usesParam(strategy, "cvar-confidence") ? params.cvarConfidence : undefined,
    view_confidence: usesParam(strategy, "view-confidence") ? params.viewConfidence : undefined,
    start_date: startDate,
    end_date: endDate,
    enforce_full_investment: params.enforceFullInvestment ?? true,
    allow_short_selling: params.allowShortSelling ?? false,
    max_leverage: params.useLeverage ? params.maxLeverage : 1.0,
  });
}

export type ReplayPlan =
  | { ok: true; params: ReplayableParams; optimizeParams: OptimizeParams }
  | { ok: false; reason: string };

/**
 * Everything the runner needs to replay a stored simulation, or why it cannot.
 * Never throws: a bad row is a skipped simulation, not a crashed batch.
 */
export function planReplay(rawParams: string, now: Date, timezone: string): ReplayPlan {
  let json: unknown;
  try {
    json = JSON.parse(rawParams);
  } catch {
    return { ok: false, reason: "unparseable_params" };
  }

  const parsed = replayableParamsSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: "unreplayable_params" };

  try {
    const params = bumpEndDate(parsed.data, now, timezone);
    const optimizeParams = toOptimizeParams(params);
    const paramsError = optimizeParamsError(optimizeParams);
    if (paramsError) return { ok: false, reason: paramsError.error };
    return { ok: true, params, optimizeParams };
  } catch {
    return { ok: false, reason: "unreplayable_params" };
  }
}
