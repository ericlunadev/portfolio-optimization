const API_BASE = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/api`
  : "/api";

const isExternal = !!process.env.NEXT_PUBLIC_API_URL;

function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    credentials: isExternal ? "include" : "same-origin",
  });
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }

  isInsufficientCredits(): boolean {
    return this.status === 402;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      error.detail || error.error || response.statusText,
      error.error
    );
  }
  return response.json();
}

export const api = {
  // Unified optimization endpoint supporting all strategies
  async optimizePortfolio(
    tickers: string[],
    strategy: OptimizationStrategy,
    options: {
      wMax?: number;
      /** Per-asset minimum weight as a decimal, aligned with `tickers`. */
      wMinPerAsset?: (number | null)[];
      /** Per-asset maximum weight as a decimal, aligned with `tickers`. */
      wMaxPerAsset?: (number | null)[];
      riskFreeRate?: number;
      targetReturn?: number;
      targetRisk?: number;
      /** Tail cut-off for `cvar`: 0.95 averages the worst 5% of periods. */
      cvarConfidence?: number;
      /** How far `black-litterman` leans on the history over equilibrium. */
      viewConfidence?: number;
      startDate?: string;
      endDate?: string;
      enforceFullInvestment?: boolean;
      allowShortSelling?: boolean;
      maxLeverage?: number;
    } = {}
  ) {
    const res = await apiFetch(`${API_BASE}/optimization/optimize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tickers,
        strategy,
        w_max: options.wMax ?? 1,
        w_min_per_asset: options.wMinPerAsset,
        w_max_per_asset: options.wMaxPerAsset,
        risk_free_rate: options.riskFreeRate ?? 0,
        target_return: options.targetReturn,
        target_risk: options.targetRisk,
        cvar_confidence: options.cvarConfidence,
        view_confidence: options.viewConfidence,
        start_date: options.startDate,
        end_date: options.endDate,
        enforce_full_investment: options.enforceFullInvestment ?? true,
        allow_short_selling: options.allowShortSelling ?? false,
        max_leverage: options.maxLeverage ?? 1.0,
      }),
    });
    return handleResponse<OptimizationResultWithStrategy>(res);
  },

  // Ticker-based optimization - minimum variance
  async optimizePortfolioTickers(
    tickers: string[],
    rMin: number,
    wMax: number = 1,
    startDate?: string,
    endDate?: string,
    enforceFullInvestment: boolean = true,
    allowShortSelling: boolean = false
  ) {
    const res = await apiFetch(`${API_BASE}/optimization/min-variance-tickers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tickers,
        r_min: rMin,
        w_max: wMax,
        start_date: startDate,
        end_date: endDate,
        enforce_full_investment: enforceFullInvestment,
        allow_short_selling: allowShortSelling,
      }),
    });
    return handleResponse<OptimizationResult>(res);
  },

  // Ticker-based optimization - maximum Sharpe ratio
  async getMaxSharpePortfolioTickers(
    tickers: string[],
    wMax: number = 1,
    riskFreeRate: number = 0,
    startDate?: string,
    endDate?: string,
    enforceFullInvestment: boolean = true,
    allowShortSelling: boolean = false
  ) {
    const res = await apiFetch(`${API_BASE}/optimization/max-sharpe-tickers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tickers,
        w_max: wMax,
        risk_free_rate: riskFreeRate,
        start_date: startDate,
        end_date: endDate,
        enforce_full_investment: enforceFullInvestment,
        allow_short_selling: allowShortSelling,
      }),
    });
    return handleResponse<MaxSharpeResult>(res);
  },

  async getEfficientFrontierTickers(
    tickers: string[],
    startDate?: string,
    endDate?: string,
    enforceFullInvestment: boolean = true,
    allowShortSelling: boolean = false,
    maxLeverage: number = 1.0,
    wMax: number = 1.0,
    wMinPerAsset?: (number | null)[],
    wMaxPerAsset?: (number | null)[]
  ) {
    const res = await apiFetch(`${API_BASE}/optimization/efficient-frontier-tickers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tickers,
        start_date: startDate,
        end_date: endDate,
        enforce_full_investment: enforceFullInvestment,
        allow_short_selling: allowShortSelling,
        max_leverage: maxLeverage,
        w_max: wMax,
        w_min_per_asset: wMinPerAsset,
        w_max_per_asset: wMaxPerAsset,
      }),
    });
    return handleResponse<EfficientFrontierResponse>(res);
  },

  async getPortfolioCumulativeReturnsTickers(tickers: string[], weights: number[], startDate?: string) {
    const res = await apiFetch(`${API_BASE}/optimization/cumulative-returns-tickers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tickers, weights, start_date: startDate }),
    });
    return handleResponse<CumulativeReturnsSeries>(res);
  },

  async getNegReturnProbability(rAnn: number, volAnn: number, months: number = 36) {
    const res = await apiFetch(`${API_BASE}/optimization/neg-return-prob`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ r_ann: rAnn, vol_ann: volAnn, months }),
    });
    return handleResponse<NegReturnProbResponse>(res);
  },

  async getRollingVolatilityTickers(
    tickers: string[],
    window: number = 252,
    startDate?: string,
    endDate?: string
  ) {
    const res = await apiFetch(`${API_BASE}/optimization/rolling-volatility-tickers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tickers,
        window,
        start_date: startDate,
        end_date: endDate,
      }),
    });
    return handleResponse<RollingVolatilityResponse>(res);
  },

  // Benchmarks
  async getBenchmarkCatalog() {
    const res = await apiFetch(`${API_BASE}/optimization/benchmarks`);
    return handleResponse<{ benchmarks: BenchmarkCatalogEntry[] }>(res);
  },

  async getBenchmarkComparison(
    benchmarks: string[],
    tickers: string[],
    weights: number[],
    options: {
      startDate?: string;
      endDate?: string;
      riskFreeRate?: number;
    } = {}
  ) {
    const res = await apiFetch(`${API_BASE}/optimization/benchmark-comparison`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        benchmarks,
        tickers,
        weights,
        start_date: options.startDate,
        end_date: options.endDate,
        risk_free_rate: options.riskFreeRate ?? 0,
      }),
    });
    return handleResponse<BenchmarkComparisonResponse>(res);
  },

  // Market data
  async getRiskFreeRates() {
    const res = await apiFetch(`${API_BASE}/market/risk-free-rates`);
    return handleResponse<RiskFreeRate[]>(res);
  },

  // Tasks
  async startYahooUpdate() {
    const res = await apiFetch(`${API_BASE}/tasks/yahoo-update`, { method: "POST" });
    return handleResponse<{ task_id: string }>(res);
  },

  async getTaskStatus(taskId: string) {
    const res = await apiFetch(`${API_BASE}/tasks/${taskId}`);
    return handleResponse<TaskStatus>(res);
  },

  // Auth is handled by better-auth client (see auth-client.ts)

  // Simulations
  async listSimulations() {
    const res = await apiFetch(`${API_BASE}/simulations`);
    return handleResponse<SimulationListItem[]>(res);
  },

  async getSimulation(id: string) {
    const res = await apiFetch(`${API_BASE}/simulations/${id}`);
    return handleResponse<SavedSimulation>(res);
  },

  async saveSimulation(params: SimulationParams, result: OptimizationResultWithStrategy, name?: string) {
    const res = await apiFetch(`${API_BASE}/simulations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ params, result, name }),
    });
    return handleResponse<SavedSimulation>(res);
  },

  async updateSimulationName(id: string, name: string | null) {
    const res = await apiFetch(`${API_BASE}/simulations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    return handleResponse<{ id: string; name: string | null; pinned: boolean }>(res);
  },

  async updateSimulationPinned(id: string, pinned: boolean) {
    const res = await apiFetch(`${API_BASE}/simulations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned }),
    });
    return handleResponse<{ id: string; name: string | null; pinned: boolean }>(res);
  },

  async updateSimulation(
    id: string,
    params: SimulationParams,
    result: OptimizationResultWithStrategy
  ) {
    const res = await apiFetch(`${API_BASE}/simulations/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ params, result }),
    });
    return handleResponse<SavedSimulation>(res);
  },

  async deleteSimulation(id: string) {
    const res = await apiFetch(`${API_BASE}/simulations/${id}`, {
      method: "DELETE",
    });
    return handleResponse<{ success: boolean }>(res);
  },

  // Onboarding
  async getOnboarding() {
    const res = await apiFetch(`${API_BASE}/onboarding`);
    return handleResponse<UserProfile>(res);
  },

  async patchOnboardingStep(step: 1 | 2 | 3, data: OnboardingStepPayload) {
    const res = await apiFetch(`${API_BASE}/onboarding/step/${step}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return handleResponse<UserProfile>(res);
  },

  async completeOnboarding() {
    const res = await apiFetch(`${API_BASE}/onboarding/complete`, { method: "POST" });
    return handleResponse<UserProfile>(res);
  },

  // Billing
  async getWallet() {
    const res = await apiFetch(`${API_BASE}/billing/wallet`);
    return handleResponse<{ credits: number; updatedAt: string | null }>(res);
  },

  async getPackages(rail?: "stripe" | "coinbase_commerce") {
    const url = rail ? `${API_BASE}/billing/packages?rail=${rail}` : `${API_BASE}/billing/packages`;
    const res = await apiFetch(url);
    return handleResponse<CreditPackageSummary[]>(res);
  },

  async createCheckoutSession(packageId: string) {
    const res = await apiFetch(`${API_BASE}/billing/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packageId }),
    });
    return handleResponse<{ url: string }>(res);
  },

  async createCryptoCheckoutSession(packageId: string) {
    const res = await apiFetch(`${API_BASE}/billing/crypto/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packageId }),
    });
    return handleResponse<{ url: string }>(res);
  },

  async getLedger(cursor?: number, limit: number = 50) {
    const params = new URLSearchParams();
    if (cursor !== undefined) params.set("cursor", String(cursor));
    params.set("limit", String(limit));
    const res = await apiFetch(`${API_BASE}/billing/ledger?${params}`);
    return handleResponse<LedgerPage>(res);
  },

  async bookAdvisorCall(idempotencyKey: string) {
    const res = await apiFetch(`${API_BASE}/billing/advisor-call`, {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
    });
    return handleResponse<{ bookingUrl: string; costCredits: number }>(res);
  },
};

export interface CreditPackageSummary {
  id: string;
  credits: number;
  priceMinor: number;
  currency: string;
  rail: "stripe" | "coinbase_commerce";
}

export interface LedgerEntry {
  id: string;
  delta: number;
  reason: "purchase" | "spend" | "grant" | "reversal";
  balanceAfter: number;
  paymentId: string | null;
  simulationId: string | null;
  createdAt: string | null;
}

export interface LedgerPage {
  items: LedgerEntry[];
  nextCursor: number | null;
}

// Optimization Strategy Types
export type OptimizationStrategy =
  | "max-sharpe"
  | "min-risk"
  | "max-return"
  | "target-return"
  | "target-risk"
  | "knee-point"
  | "risk-parity"
  | "black-litterman"
  | "hrp"
  | "max-diversification"
  | "cvar"
  | "equal-weight";

/**
 * The extra input a strategy needs from the user. A strategy can need more than
 * one — Black-Litterman blends against a risk-free rate *and* asks how much to
 * trust the historical estimates.
 */
export type StrategyParam =
  | "risk-free-rate"
  | "target-return"
  | "target-risk"
  | "cvar-confidence"
  | "view-confidence";

/**
 * Strategies in the order the picker offers them: the six that walk the
 * mean-variance efficient frontier first, then the six that size positions from
 * risk alone. Labels and descriptions live under the `Strategies.<value>` i18n
 * keys.
 */
export const OPTIMIZATION_STRATEGIES: {
  value: OptimizationStrategy;
  params: StrategyParam[];
}[] = [
  { value: "max-sharpe", params: ["risk-free-rate"] },
  { value: "min-risk", params: [] },
  { value: "max-return", params: [] },
  { value: "target-return", params: ["target-return"] },
  { value: "target-risk", params: ["target-risk"] },
  { value: "knee-point", params: [] },
  { value: "risk-parity", params: [] },
  { value: "black-litterman", params: ["risk-free-rate", "view-confidence"] },
  { value: "hrp", params: [] },
  { value: "max-diversification", params: [] },
  { value: "cvar", params: ["cvar-confidence"] },
  { value: "equal-weight", params: [] },
];

/**
 * Whether a strategy reads a given input. Every place that shows, saves or
 * sends one of these values asks here, so a strategy's inputs are declared once
 * rather than re-derived from a chain of `strategy === "..."` checks.
 */
export function strategyUsesParam(
  strategy: OptimizationStrategy,
  param: StrategyParam
): boolean {
  return (
    OPTIMIZATION_STRATEGIES.find((s) => s.value === strategy)?.params.includes(param) ??
    false
  );
}

// Types
export interface OptimizationResult {
  weights: {
    fund_id: number;
    fund_name: string;
    weight: number;
    exp_ret: number;
    volatility: number;
  }[];
  expected_return: number;
  volatility: number;
  stats: {
    ci_95_low: number;
    ci_95_high: number;
    prob_neg_1m: number;
    prob_neg_3m: number;
    prob_neg_1y: number;
    prob_neg_2y: number;
  };
}

export interface OptimizationResultWithStrategy {
  weights: {
    fund_id: number;
    fund_name: string;
    weight: number;
    exp_ret: number;
    volatility: number;
  }[];
  expected_return: number;
  volatility: number;
  sharpe_ratio: number;
  strategy: OptimizationStrategy;
  /**
   * Annualized covariances between assets, in the same order as `weights`.
   * Optional: simulations saved before this field existed do not carry it.
   */
  covariance_matrix?: number[][];
  stats: {
    ci_95_low: number;
    ci_95_high: number;
    prob_neg_1m: number;
    prob_neg_3m: number;
    prob_neg_1y: number;
    prob_neg_2y: number;
  };
}

export interface MaxSharpeResult {
  weights: {
    fund_id: number;
    fund_name: string;
    weight: number;
    exp_ret: number;
    volatility: number;
  }[];
  expected_return: number;
  volatility: number;
  sharpe_ratio: number;
  stats: {
    ci_95_low: number;
    ci_95_high: number;
    prob_neg_1m: number;
    prob_neg_3m: number;
    prob_neg_1y: number;
    prob_neg_2y: number;
  };
}

export interface EfficientFrontierResponse {
  tickers: string[];
  points: { ret: number; vol: number; weights: number[] }[];
}

// Benchmark Types
export type BenchmarkCategory = "equity" | "global" | "diversified";

export interface BenchmarkCatalogEntry {
  id: string;
  category: BenchmarkCategory;
  /** Underlying symbols, shown as the subtitle of a benchmark's row. */
  tickers: string[];
}

/** Performance of a portfolio or benchmark over the comparison window. */
export interface BenchmarkPerformance {
  expected_return: number;
  volatility: number;
  sharpe_ratio: number;
  /** Deepest peak-to-trough fall, as a negative decimal. */
  max_drawdown: number;
  /** Cumulative return across the whole window. */
  total_return: number;
  series: { date: string; value: number }[];
}

export interface BenchmarkComparisonEntry extends BenchmarkPerformance {
  id: string;
  category: BenchmarkCategory;
  tickers: string[];
}

export interface BenchmarkComparisonResponse {
  window: { start: string; end: string };
  /** Null when the portfolio's own tickers could not be priced. */
  portfolio: BenchmarkPerformance | null;
  benchmarks: BenchmarkComparisonEntry[];
  /** Ids the provider had no usable prices for. */
  unavailable: string[];
}

export interface CumulativeReturnsSeries {
  series: { name: string; data: { date: string; value: number }[] }[];
}

export interface NegReturnProbResponse {
  points: { months: number; probability: number }[];
}

export interface RollingVolatilityResponse {
  series: { name: string; data: { date: string; volatility: number }[] }[];
}

/**
 * Reference instruments the risk-free rate can be taken from, in the order the
 * picker lists them. `manual` lets the user type their own rate instead.
 *
 * These ids mirror `RISK_FREE_INSTRUMENTS` on the API and are used as
 * translation keys, so the two lists must stay in sync.
 */
export const RISK_FREE_INSTRUMENT_IDS = [
  "us-t-bill-3m",
  "us-treasury-5y",
  "us-treasury-10y",
  "us-treasury-30y",
] as const;

export type RiskFreeInstrumentId = (typeof RISK_FREE_INSTRUMENT_IDS)[number];

/** Where the risk-free rate came from: a reference instrument, or typed by hand. */
export type RiskFreeSource = RiskFreeInstrumentId | "manual";

export function isRiskFreeInstrumentId(value: string): value is RiskFreeInstrumentId {
  return (RISK_FREE_INSTRUMENT_IDS as readonly string[]).includes(value);
}

export interface RiskFreeRate {
  id: RiskFreeInstrumentId;
  ticker: string;
  /** Annualised yield as a decimal (0.0425 for 4.25%). */
  rate: number;
  /** ISO timestamp of the quote the rate was read from. */
  asOf: string;
}

export interface TaskStatus {
  task_id: string;
  task_type: string;
  status: string;
  progress: number;
  result_data?: string;
  error_message?: string;
}

// User type is now managed by better-auth client (see auth-client.ts)

// Simulation Types
export interface DateRange {
  startMonth: number;
  startYear: number;
  endMonth: number;
  endYear: number;
}

/**
 * One row of the asset picker. `allocation` is the user's own current holding,
 * used for the comparison chart. `minWeight` / `maxWeight` are the percentage
 * limits the optimizer must allocate between; both are optional and absent on
 * simulations saved before per-asset limits existed.
 */
export interface SimulationAsset {
  ticker: string;
  allocation: number | null;
  /** Minimum weight in percent (0-100), or null for no floor. */
  minWeight?: number | null;
  /** Maximum weight in percent (0-100), or null for no cap. */
  maxWeight?: number | null;
}

export interface SimulationParams {
  tickers: string[];
  assets: SimulationAsset[];
  dateRange: DateRange;
  strategy: OptimizationStrategy;
  targetReturn?: number;
  targetRisk?: number;
  /** Tail cut-off for `cvar`. Absent on simulations saved before it existed. */
  cvarConfidence?: number;
  /** View confidence for `black-litterman`, likewise optional on old rows. */
  viewConfidence?: number;
  riskFreeRate: number;
  enforceFullInvestment: boolean;
  allowShortSelling: boolean;
  useLeverage: boolean;
  maxLeverage: number;
  assetConstraints: boolean;
  wMax: number;
  /** Whether the per-asset min/max limits carried on `assets` are applied. */
  assetLimits?: boolean;
  showFrontier: boolean;
  /**
   * Ids of the benchmarks the results are compared against. Absent on
   * simulations saved before benchmark comparison existed.
   */
  benchmarks?: string[];
}

export interface SavedSimulation {
  id: string;
  name: string | null;
  params: SimulationParams;
  result: OptimizationResultWithStrategy;
  createdAt: string;
}

export interface SimulationListItem {
  id: string;
  name: string | null;
  tickers: string[];
  strategy: OptimizationStrategy;
  expectedReturn: number;
  volatility: number;
  sharpeRatio: number;
  params: SimulationParams;
  pinned: boolean;
  createdAt: string;
}

// Onboarding Types
export type ExperienceLevel = "none" | "beginner" | "intermediate" | "advanced";
export type InvestmentHorizon = "short" | "medium" | "long";
export type RiskBehavior = "sell_all" | "sell_some" | "hold" | "buy_more";
export type RiskTolerance = "conservative" | "moderate" | "aggressive";
export type InvestmentGoal = "retirement" | "growth" | "preservation" | "specific";
export type MarketCode = "MX" | "US" | "EU" | "LATAM" | "AR" | "CRYPTO";
export type ConceptKey = "markowitz" | "sharpe" | "volatility" | "beta" | "frontier";

export interface UserProfile {
  id: number;
  userId: string;
  countryCode: string | null;
  currency: string | null;
  experience: ExperienceLevel | null;
  horizon: InvestmentHorizon | null;
  riskBehavior: RiskBehavior | null;
  riskTolerance: RiskTolerance | null;
  goal: InvestmentGoal | null;
  marketsOfInterest: MarketCode[] | null;
  otherMarkets: string[] | null;
  conceptFamiliarity: ConceptKey[] | null;
  currentStep: number;
  completedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export type OnboardingStepPayload =
  | { countryCode: string; currency: string }
  | {
      experience: ExperienceLevel;
      horizon: InvestmentHorizon;
      riskBehavior: RiskBehavior;
      goal: InvestmentGoal;
    }
  | {
      marketsOfInterest: MarketCode[];
      otherMarkets: string[];
      conceptFamiliarity: ConceptKey[];
    };
