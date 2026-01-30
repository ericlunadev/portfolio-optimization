import { NextRequest, NextResponse } from "next/server";
import { getTickerAssumptions } from "@/lib/yahoo";
import { buildCovarianceMatrix } from "@/lib/math/matrix";
import { findMaxSharpePortfolio } from "@/lib/math/optimizer";
import { normalCDF } from "@/lib/math/stats";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      tickers,
      w_max = 1.0,
      risk_free_rate = 0,
      start_date,
      end_date,
      enforce_full_investment = true,
      allow_short_selling = false,
    } = body;

    if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
      return NextResponse.json({ error: "Tickers array is required" }, { status: 400 });
    }

    const { expectedReturns, volatilities, corrMatrix } = await getTickerAssumptions(tickers, start_date, end_date);
    const covMatrix = buildCovarianceMatrix(volatilities, corrMatrix);

    const result = findMaxSharpePortfolio(expectedReturns, covMatrix, {
      wMax: w_max,
      riskFreeRate: risk_free_rate,
      numFrontierPoints: 50,
    });

    const weights = tickers.map((ticker: string, i: number) => ({
      fund_id: i,
      fund_name: ticker,
      weight: result.weights[i],
      exp_ret: expectedReturns[i],
      volatility: volatilities[i],
    }));

    const calcProbNeg = (months: number) => {
      const timeInYears = months / 12;
      const meanT = result.return * timeInYears;
      const volT = result.volatility * Math.sqrt(timeInYears);
      const zScore = -meanT / volT;
      return normalCDF(zScore);
    };

    // Calculate Sharpe ratio
    const sharpeRatio = result.volatility > 0 ? (result.return - risk_free_rate) / result.volatility : 0;

    return NextResponse.json({
      weights,
      expected_return: result.return,
      volatility: result.volatility,
      sharpe_ratio: sharpeRatio,
      stats: {
        ci_95_low: result.return - 1.96 * result.volatility,
        ci_95_high: result.return + 1.96 * result.volatility,
        prob_neg_1m: calcProbNeg(1),
        prob_neg_3m: calcProbNeg(3),
        prob_neg_1y: calcProbNeg(12),
        prob_neg_2y: calcProbNeg(24),
      },
    });
  } catch (error) {
    console.error("Max Sharpe optimization error:", error);
    return NextResponse.json({ error: "Optimization failed" }, { status: 500 });
  }
}
