import { NextRequest, NextResponse } from "next/server";
import { getHistoricalPrices } from "@/lib/yahoo";
import { rollingStdDev } from "@/lib/math/stats";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tickers, window = 252, start_date, end_date } = body;

    if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
      return NextResponse.json({ error: "Tickers array is required" }, { status: 400 });
    }

    if (window < 2 || window > 504) {
      return NextResponse.json({ error: "Window must be between 2 and 504" }, { status: 400 });
    }

    const pricesByTicker = await getHistoricalPrices(tickers, start_date, end_date);

    // Calculate rolling volatility for each ticker
    const series = tickers.map((ticker: string) => {
      const prices = pricesByTicker.get(ticker) ?? [];

      // Calculate daily log returns
      const returns: number[] = [];
      for (let i = 1; i < prices.length; i++) {
        returns.push(Math.log(prices[i].close / prices[i - 1].close));
      }

      // Calculate rolling standard deviation (annualized)
      const rollingVols = rollingStdDev(returns, window).map((vol) => vol * Math.sqrt(252));

      // Get dates starting from window position
      const dates = prices.slice(window).map((p) => p.date);

      return {
        name: ticker,
        data: dates.map((date, i) => ({
          date,
          volatility: rollingVols[i] ?? 0,
        })),
      };
    });

    return NextResponse.json({ series });
  } catch (error) {
    console.error("Rolling volatility error:", error);
    return NextResponse.json({ error: "Rolling volatility calculation failed" }, { status: 500 });
  }
}
