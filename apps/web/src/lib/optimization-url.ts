import { OptimizationStrategy, OPTIMIZATION_STRATEGIES } from "@/lib/api";
import { DateRange } from "@/components/forms/DateRangePicker";
import { AssetRow } from "@/components/forms/AssetAllocationForm";

/**
 * Serializes the optimization form state to/from URL query params so the form
 * can be restored when the user navigates back from the results page (or shares
 * a link). Every field maps to a query param; defaults are omitted to keep the
 * URL short.
 */

export interface OptimizationFormState {
  assets: AssetRow[];
  dateRange: DateRange;
  strategy: OptimizationStrategy;
  targetReturn: number;
  targetRisk: number;
  riskFreeRate: number;
  enforceFullInvestment: boolean;
  allowShortSelling: boolean;
  useLeverage: boolean;
  maxLeverage: number;
  assetConstraints: boolean;
  wMax: number;
  showFrontier: boolean;
}

const VALID_STRATEGIES = new Set(OPTIMIZATION_STRATEGIES.map((s) => s.value));

function generateId() {
  return Math.random().toString(36).slice(2, 9);
}

function makeAsset(ticker: string, allocation: number | null): AssetRow {
  return { id: generateId(), ticker, allocation };
}

export function defaultFormState(currentYear: number): OptimizationFormState {
  return {
    assets: [makeAsset("", null), makeAsset("", null)],
    dateRange: {
      startMonth: 1,
      startYear: currentYear - 5,
      endMonth: 12,
      endYear: currentYear,
    },
    strategy: "max-sharpe",
    targetReturn: 0.1,
    targetRisk: 0.15,
    riskFreeRate: 0.05,
    enforceFullInvestment: true,
    allowShortSelling: false,
    useLeverage: false,
    maxLeverage: 1.5,
    assetConstraints: false,
    wMax: 0.4,
    showFrontier: true,
  };
}

/**
 * Encode an asset row as `TICKER~ALLOCATION`, where allocation is empty for
 * null. Empty rows (no ticker, no allocation) are preserved so the row layout
 * round-trips. Rows are joined with commas.
 */
function encodeAssets(assets: AssetRow[]): string {
  return assets
    .map((a) => `${a.ticker}~${a.allocation ?? ""}`)
    .join(",");
}

function decodeAssets(raw: string): AssetRow[] {
  const rows = raw.split(",").map((pair) => {
    const sepIndex = pair.indexOf("~");
    const ticker = sepIndex >= 0 ? pair.slice(0, sepIndex) : pair;
    const allocRaw = sepIndex >= 0 ? pair.slice(sepIndex + 1) : "";
    const allocation = allocRaw === "" ? null : Number(allocRaw);
    return makeAsset(
      ticker.trim().toUpperCase(),
      allocation !== null && Number.isFinite(allocation) ? allocation : null
    );
  });
  return rows.length > 0 ? rows : [makeAsset("", null), makeAsset("", null)];
}

function bool(v: boolean): string {
  return v ? "1" : "0";
}

function parseBool(v: string | null, fallback: boolean): boolean {
  if (v === null) return fallback;
  return v === "1" || v === "true";
}

function parseNum(v: string | null, fallback: number): number {
  if (v === null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseInt10(v: string | null, fallback: number): number {
  if (v === null) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Build a URLSearchParams from form state. Default values are dropped so a
 * pristine form yields an empty query string. Strategy-specific fields
 * (target return/risk, risk-free rate) are only written when relevant.
 */
export function encodeFormState(
  state: OptimizationFormState,
  currentYear: number
): URLSearchParams {
  const defaults = defaultFormState(currentYear);
  const params = new URLSearchParams();

  const hasAnyAssetContent = state.assets.some(
    (a) => a.ticker !== "" || a.allocation !== null
  );
  if (hasAnyAssetContent) {
    params.set("assets", encodeAssets(state.assets));
  }

  if (state.dateRange.startMonth !== defaults.dateRange.startMonth) {
    params.set("startMonth", String(state.dateRange.startMonth));
  }
  if (state.dateRange.startYear !== defaults.dateRange.startYear) {
    params.set("startYear", String(state.dateRange.startYear));
  }
  if (state.dateRange.endMonth !== defaults.dateRange.endMonth) {
    params.set("endMonth", String(state.dateRange.endMonth));
  }
  if (state.dateRange.endYear !== defaults.dateRange.endYear) {
    params.set("endYear", String(state.dateRange.endYear));
  }

  if (state.strategy !== defaults.strategy) {
    params.set("strategy", state.strategy);
  }
  if (state.strategy === "target-return") {
    params.set("targetReturn", String(state.targetReturn));
  }
  if (state.strategy === "target-risk") {
    params.set("targetRisk", String(state.targetRisk));
  }
  if (state.strategy === "max-sharpe" && state.riskFreeRate !== defaults.riskFreeRate) {
    params.set("riskFreeRate", String(state.riskFreeRate));
  }

  if (state.enforceFullInvestment !== defaults.enforceFullInvestment) {
    params.set("enforceFullInvestment", bool(state.enforceFullInvestment));
  }
  if (state.allowShortSelling !== defaults.allowShortSelling) {
    params.set("allowShortSelling", bool(state.allowShortSelling));
  }
  if (state.useLeverage !== defaults.useLeverage) {
    params.set("useLeverage", bool(state.useLeverage));
  }
  if (state.useLeverage && state.maxLeverage !== defaults.maxLeverage) {
    params.set("maxLeverage", String(state.maxLeverage));
  }
  if (state.assetConstraints !== defaults.assetConstraints) {
    params.set("assetConstraints", bool(state.assetConstraints));
  }
  if (state.assetConstraints && state.wMax !== defaults.wMax) {
    params.set("wMax", String(state.wMax));
  }
  if (state.showFrontier !== defaults.showFrontier) {
    params.set("showFrontier", bool(state.showFrontier));
  }

  return params;
}

/**
 * Reconstruct form state from URL query params, falling back to defaults for
 * any field that is absent or malformed.
 */
export function decodeFormState(
  params: URLSearchParams,
  currentYear: number
): OptimizationFormState {
  const defaults = defaultFormState(currentYear);

  const assetsRaw = params.get("assets");

  const strategyRaw = params.get("strategy");
  const strategy =
    strategyRaw && VALID_STRATEGIES.has(strategyRaw as OptimizationStrategy)
      ? (strategyRaw as OptimizationStrategy)
      : defaults.strategy;

  return {
    assets: assetsRaw !== null ? decodeAssets(assetsRaw) : defaults.assets,
    dateRange: {
      startMonth: parseInt10(params.get("startMonth"), defaults.dateRange.startMonth),
      startYear: parseInt10(params.get("startYear"), defaults.dateRange.startYear),
      endMonth: parseInt10(params.get("endMonth"), defaults.dateRange.endMonth),
      endYear: parseInt10(params.get("endYear"), defaults.dateRange.endYear),
    },
    strategy,
    targetReturn: parseNum(params.get("targetReturn"), defaults.targetReturn),
    targetRisk: parseNum(params.get("targetRisk"), defaults.targetRisk),
    riskFreeRate: parseNum(params.get("riskFreeRate"), defaults.riskFreeRate),
    enforceFullInvestment: parseBool(
      params.get("enforceFullInvestment"),
      defaults.enforceFullInvestment
    ),
    allowShortSelling: parseBool(params.get("allowShortSelling"), defaults.allowShortSelling),
    useLeverage: parseBool(params.get("useLeverage"), defaults.useLeverage),
    maxLeverage: parseNum(params.get("maxLeverage"), defaults.maxLeverage),
    assetConstraints: parseBool(params.get("assetConstraints"), defaults.assetConstraints),
    wMax: parseNum(params.get("wMax"), defaults.wMax),
    showFrontier: parseBool(params.get("showFrontier"), defaults.showFrontier),
  };
}
