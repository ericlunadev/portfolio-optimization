import { ApiError } from "@/lib/api";

/**
 * What went wrong with an optimize request, as a `NewOptimization` translation
 * key plus its values. The API's own `detail` text is English-only, so the page
 * never shows it directly; it maps the machine-readable `error` code instead.
 *
 * A 402 (out of credits) is not handled here — the page has a dedicated screen
 * for it.
 */
export type OptimizeErrorDescription = {
  key:
    | "errorOptimize"
    | "errorBoundsMismatch"
    | "errorNegativeMinWeight"
    | "errorMinAboveMax"
    | "errorMinAboveTotal"
    | "errorMinWeightsExceedTotal"
    | "errorMaxWeightsBelowTotal"
    | "errorMissingStrategyTarget"
    | "errorInstrumentNotAllowed"
    | "errorInvalidParams"
    | "errorBadRequest";
  values?: Record<string, string>;
  /** The raw API code, shown alongside unmapped errors so they can be reported. */
  code?: string;
};

const BOUNDS_CODES: Record<string, OptimizeErrorDescription["key"]> = {
  bounds_length_mismatch: "errorBoundsMismatch",
  negative_min_weight: "errorNegativeMinWeight",
  min_above_max: "errorMinAboveMax",
  min_above_total: "errorMinAboveTotal",
  min_weights_exceed_total: "errorMinWeightsExceedTotal",
  max_weights_below_total: "errorMaxWeightsBelowTotal",
  missing_strategy_target: "errorMissingStrategyTarget",
};

const INSTRUMENT_NOT_ALLOWED = "INSTRUMENT_NOT_ALLOWED";

type ZodIssue = { path?: unknown[] };

/** The field names a `@hono/zod-validator` 400 body complains about. */
function zodIssueFields(body: Record<string, unknown> | undefined): string[] | null {
  if (!body || body.success !== false) return null;
  const error = body.error as { issues?: ZodIssue[] } | undefined;
  if (!error || !Array.isArray(error.issues)) return null;

  const fields = error.issues
    .map((issue) => (Array.isArray(issue.path) ? issue.path.filter((p) => typeof p === "string") : []))
    .map((path) => path.join("."))
    .filter((field) => field.length > 0);
  return Array.from(new Set(fields));
}

export function describeOptimizeError(error: unknown): OptimizeErrorDescription {
  if (!(error instanceof ApiError) || error.status !== 400) {
    return { key: "errorOptimize" };
  }

  const code = error.code;

  if (code && BOUNDS_CODES[code]) {
    return { key: BOUNDS_CODES[code] };
  }

  // HTTPException bodies arrive as `{ error: "INSTRUMENT_NOT_ALLOWED: A, B" }`.
  if (code?.startsWith(INSTRUMENT_NOT_ALLOWED)) {
    const tickers = code.slice(INSTRUMENT_NOT_ALLOWED.length).replace(/^:\s*/, "").trim();
    return { key: "errorInstrumentNotAllowed", values: { tickers } };
  }

  const fields = zodIssueFields(error.body);
  if (fields) {
    return { key: "errorInvalidParams", values: { fields: fields.join(", ") || "-" } };
  }

  return { key: "errorBadRequest", code };
}
