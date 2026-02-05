import { NextRequest, NextResponse } from "next/server";
import { getTickerAssumptions } from "@/lib/yahoo";
import { buildCovarianceMatrix } from "@/lib/math/matrix";
import {
  findMinVariancePortfolio,
  findMaxSharpePortfolio,
  findMaxReturnPortfolio,
  findTargetReturnPortfolio,
  findTargetRiskPortfolio,
  findKneePointPortfolio,
  calculateEfficientFrontier,
  OptimizationResult,
} from "@/lib/math/optimizer";
import { normalCDF } from "@/lib/math/stats";
import type { OptimizationStrategy } from "@/lib/api";

interface OptimizeRequest {
  tickers: string[];
  strategy: OptimizationStrategy;
  w_max?: number;
  risk_free_rate?: number;
  target_return?: number;
  target_risk?: number;
  start_date?: string;
  end_date?: string;
  enforce_full_investment?: boolean;
  allow_short_selling?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body: OptimizeRequest = await request.json();
    const {
      tickers,
      strategy,
      w_max = 1.0,
      risk_free_rate = 0,
      target_return,
      target_risk,
      start_date,
      end_date,
      enforce_full_investment = true,
      allow_short_selling = false,
    } = body;

    if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
      return NextResponse.json({ error: "Tickers array is required" }, { status: 400 });
    }

    if (!strategy) {
      return NextResponse.json({ error: "Strategy is required" }, { status: 400 });
    }

    const { expectedReturns, volatilities, corrMatrix } = await getTickerAssumptions(
      tickers,
      start_date,
      end_date
    );
    const covMatrix = buildCovarianceMatrix(volatilities, corrMatrix);

    let result: OptimizationResult & { sharpeRatio?: number };

    switch (strategy) {
      case "max-sharpe":
        // Debug: Calculate frontier and log Sharpe ratios
        const debugFrontier = calculateEfficientFrontier(
          expectedReturns,
          covMatrix,
          20,
          w_max,
          { enforceFullInvestment: enforce_full_investment, allowShortSelling: allow_short_selling }
        );

        console.log("\n=== MAX SHARPE DEBUG ===");
        console.log("Risk-free rate:", risk_free_rate);
        console.log("\nFrontier points with Sharpe ratios:");
        debugFrontier.returns.forEach((ret, i) => {
          const vol = debugFrontier.volatilities[i];
          const sharpe = vol > 0 ? (ret - risk_free_rate) / vol : 0;
          console.log(`Point ${i}: Return=${(ret * 100).toFixed(2)}%, Vol=${(vol * 100).toFixed(2)}%, Sharpe=${sharpe.toFixed(4)}`);
        });
        console.log("========================\n");

        result = findMaxSharpePortfolio(expectedReturns, covMatrix, {
          wMax: w_max,
          riskFreeRate: risk_free_rate,
          numFrontierPoints: 50,
          enforceFullInvestment: enforce_full_investment,
          allowShortSelling: allow_short_selling,
        });

        console.log("Selected portfolio:", {
          return: (result.return * 100).toFixed(2) + "%",
          volatility: (result.volatility * 100).toFixed(2) + "%",
          sharpe: result.sharpeRatio?.toFixed(4),
        });
        break;

      case "min-risk":
        result = findMinVariancePortfolio(expectedReturns, covMatrix, {
          rMin: Math.min(...expectedReturns),
          wMax: w_max,
          enforceFullInvestment: enforce_full_investment,
          allowShortSelling: allow_short_selling,
        });
        break;

      case "max-return":
        result = findMaxReturnPortfolio(expectedReturns, covMatrix, {
          wMax: w_max,
        });
        break;

      case "target-return":
        if (target_return === undefined) {
          return NextResponse.json(
            { error: "target_return is required for target-return strategy" },
            { status: 400 }
          );
        }
        result = findTargetReturnPortfolio(expectedReturns, covMatrix, target_return, {
          wMax: w_max,
          enforceFullInvestment: enforce_full_investment,
          allowShortSelling: allow_short_selling,
        });
        break;

      case "target-risk":
        if (target_risk === undefined) {
          return NextResponse.json(
            { error: "target_risk is required for target-risk strategy" },
            { status: 400 }
          );
        }
        result = findTargetRiskPortfolio(expectedReturns, covMatrix, target_risk, {
          wMax: w_max,
          numFrontierPoints: 50,
          enforceFullInvestment: enforce_full_investment,
          allowShortSelling: allow_short_selling,
        });
        break;

      case "knee-point":
        result = findKneePointPortfolio(expectedReturns, covMatrix, {
          wMax: w_max,
          numFrontierPoints: 50,
          enforceFullInvestment: enforce_full_investment,
          allowShortSelling: allow_short_selling,
        });
        break;

      default:
        return NextResponse.json({ error: `Unknown strategy: ${strategy}` }, { status: 400 });
    }

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

    // Calculate Sharpe ratio for the result
    const sharpeRatio =
      result.sharpeRatio ??
      (result.volatility > 0 ? (result.return - risk_free_rate) / result.volatility : 0);

    return NextResponse.json({
      weights,
      expected_return: result.return,
      volatility: result.volatility,
      sharpe_ratio: sharpeRatio,
      strategy,
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
    console.error("Optimization error:", error);
    return NextResponse.json({ error: "Optimization failed" }, { status: 500 });
  }
}
