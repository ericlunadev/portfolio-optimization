import { NextRequest, NextResponse } from "next/server";
import { getTickerAssumptions } from "@/lib/yahoo";
import { buildCovarianceMatrix } from "@/lib/math/matrix";
import { calculateEfficientFrontier } from "@/lib/math/optimizer";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tickers, start_date, end_date } = body;

    if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
      return NextResponse.json({ error: "Tickers array is required" }, { status: 400 });
    }

    const { expectedReturns, volatilities, corrMatrix } = await getTickerAssumptions(tickers, start_date, end_date);
    const covMatrix = buildCovarianceMatrix(volatilities, corrMatrix);

    const frontier = calculateEfficientFrontier(expectedReturns, covMatrix, 9);

    return NextResponse.json({
      points: frontier.returns.map((ret, i) => ({
        ret: ret,
        vol: frontier.volatilities[i],
      })),
    });
  } catch (error) {
    console.error("Efficient frontier error:", error);
    return NextResponse.json({ error: "Efficient frontier calculation failed" }, { status: 500 });
  }
}
