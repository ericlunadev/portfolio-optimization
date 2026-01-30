const API_BASE = "/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(response.status, error.detail || response.statusText);
  }
  return response.json();
}

export const api = {
  // Ticker-based optimization - minimum variance
  async optimizePortfolioTickers(
    tickers: string[],
    rMin: number,
    wMax: number = 1,
    startDate?: string,
    endDate?: string,
    enforceFullInvestment: boolean = true,
    allowShortSelling: boolean = false,
    volMax?: number
  ) {
    const res = await fetch(`${API_BASE}/optimization/min-variance-tickers`, {
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
        vol_max: volMax,
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
    const res = await fetch(`${API_BASE}/optimization/max-sharpe-tickers`, {
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
    allowShortSelling: boolean = false
  ) {
    const res = await fetch(`${API_BASE}/optimization/efficient-frontier-tickers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tickers,
        start_date: startDate,
        end_date: endDate,
        enforce_full_investment: enforceFullInvestment,
        allow_short_selling: allowShortSelling,
      }),
    });
    return handleResponse<EfficientFrontierResponse>(res);
  },

  async getPortfolioCumulativeReturnsTickers(tickers: string[], weights: number[], startDate?: string) {
    const res = await fetch(`${API_BASE}/optimization/cumulative-returns-tickers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tickers, weights, start_date: startDate }),
    });
    return handleResponse<CumulativeReturnsSeries>(res);
  },

  async getNegReturnProbability(rAnn: number, volAnn: number, months: number = 36) {
    const res = await fetch(`${API_BASE}/optimization/neg-return-prob`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ r_ann: rAnn, vol_ann: volAnn, months }),
    });
    return handleResponse<NegReturnProbResponse>(res);
  },

  async getRollingVolatilityTickers(
    tickers: string[],
    window: number = 12,
    startDate?: string,
    endDate?: string
  ) {
    const res = await fetch(`${API_BASE}/optimization/rolling-volatility-tickers`, {
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

  // Tasks
  async startYahooUpdate() {
    const res = await fetch(`${API_BASE}/tasks/yahoo-update`, { method: "POST" });
    return handleResponse<{ task_id: string }>(res);
  },

  async getTaskStatus(taskId: string) {
    const res = await fetch(`${API_BASE}/tasks/${taskId}`);
    return handleResponse<TaskStatus>(res);
  },

  // Auth
  async getCurrentUser() {
    const res = await fetch(`${API_BASE}/auth/me`);
    return handleResponse<User>(res);
  },
};

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
  points: { ret: number; vol: number }[];
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

export interface TaskStatus {
  task_id: string;
  task_type: string;
  status: string;
  progress: number;
  result_data?: string;
  error_message?: string;
}

export interface User {
  id: number;
  email: string;
  name: string | null;
  picture_url: string | null;
}
