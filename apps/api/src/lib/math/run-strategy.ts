import {
  ConstraintOptions,
  OptimizationResult,
  findKneePointPortfolio,
  findMaxReturnPortfolio,
  findMaxSharpePortfolio,
  findMinVariancePortfolio,
  findTargetReturnPortfolio,
  findTargetRiskPortfolio,
} from "./optimizer.js";
import {
  findEqualWeightPortfolio,
  findHierarchicalRiskParityPortfolio,
  findMaxDiversificationPortfolio,
  findMinCVaRPortfolio,
  findRiskParityPortfolio,
} from "./allocators.js";
import { findBlackLittermanPortfolio } from "./black-litterman.js";
import type { OptimizationStrategy } from "./strategies.js";

/**
 * Dispatch from a strategy name to the solver that implements it.
 *
 * This lives apart from the route so every strategy can be exercised against
 * fixed assumptions in a test, without a session, a credit balance or a call to
 * Yahoo. The route's job is to gather the inputs; this decides what to do with
 * them.
 */

/** How many frontier points the strategies that scan one should sample. */
const FRONTIER_POINTS = 50;

export interface StrategyInput {
  strategy: OptimizationStrategy;
  /** Annualized expected return per asset. */
  expectedReturns: number[];
  /** Annualized covariances, in the same asset order. */
  covMatrix: number[][];
  /** Daily returns per asset, `[asset][day]`. Only CVaR reads them. */
  dailyReturns: number[][];
  constraints: ConstraintOptions;
  riskFreeRate: number;
  targetReturn?: number;
  targetRisk?: number;
  cvarConfidence: number;
  viewConfidence: number;
}

/** A strategy was asked for without the parameter it cannot run without. */
export class MissingStrategyTargetError extends Error {
  constructor(readonly field: "target_return" | "target_risk") {
    super(`${field} is required for this strategy`);
    this.name = "MissingStrategyTargetError";
  }
}

/**
 * Which request field a strategy cannot run without, or `null` when it needs
 * none. Routes check this before charging for the request, so a call that was
 * never going to work does not cost a credit.
 */
export function requiredTargetField(
  strategy: OptimizationStrategy
): "target_return" | "target_risk" | null {
  if (strategy === "target-return") return "target_return";
  if (strategy === "target-risk") return "target_risk";
  return null;
}

export function runStrategy(
  input: StrategyInput
): OptimizationResult & { sharpeRatio?: number } {
  const {
    strategy,
    expectedReturns,
    covMatrix,
    dailyReturns,
    constraints,
    riskFreeRate,
    cvarConfidence,
    viewConfidence,
  } = input;

  switch (strategy) {
    case "max-sharpe":
      return findMaxSharpePortfolio(expectedReturns, covMatrix, {
        ...constraints,
        riskFreeRate,
        numFrontierPoints: FRONTIER_POINTS,
      });

    case "min-risk":
      return findMinVariancePortfolio(expectedReturns, covMatrix, {
        ...constraints,
        // The lowest return any portfolio could have, so the return constraint
        // never binds and variance alone decides.
        rMin: Math.min(...expectedReturns) * (constraints.maxLeverage ?? 1),
      });

    case "max-return":
      return findMaxReturnPortfolio(expectedReturns, covMatrix, constraints);

    case "target-return":
      return findTargetReturnPortfolio(
        expectedReturns,
        covMatrix,
        required(input.targetReturn, "target_return"),
        constraints
      );

    case "target-risk":
      return findTargetRiskPortfolio(
        expectedReturns,
        covMatrix,
        required(input.targetRisk, "target_risk"),
        { ...constraints, numFrontierPoints: FRONTIER_POINTS }
      );

    case "knee-point":
      return findKneePointPortfolio(expectedReturns, covMatrix, {
        ...constraints,
        numFrontierPoints: FRONTIER_POINTS,
      });

    case "risk-parity":
      return findRiskParityPortfolio(expectedReturns, covMatrix, constraints);

    case "black-litterman":
      return findBlackLittermanPortfolio(expectedReturns, covMatrix, {
        ...constraints,
        riskFreeRate,
        viewConfidence,
      });

    case "hrp":
      return findHierarchicalRiskParityPortfolio(expectedReturns, covMatrix, constraints);

    case "max-diversification":
      return findMaxDiversificationPortfolio(expectedReturns, covMatrix, constraints);

    case "cvar":
      return findMinCVaRPortfolio(dailyReturns, expectedReturns, covMatrix, {
        ...constraints,
        confidence: cvarConfidence,
      });

    case "equal-weight":
      return findEqualWeightPortfolio(expectedReturns, covMatrix, constraints);
  }
}

function required(
  value: number | undefined,
  field: "target_return" | "target_risk"
): number {
  if (value === undefined) throw new MissingStrategyTargetError(field);
  return value;
}
