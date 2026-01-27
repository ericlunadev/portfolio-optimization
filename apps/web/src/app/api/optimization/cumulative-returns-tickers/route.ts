import { NextRequest, NextResponse } from "next/server";
import { getHistoricalPrices } from "@/lib/yahoo";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tickers, weights, start_date } = body;

    if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
      return NextResponse.json({ error: "Tickers array is required" }, { status: 400 });
    }

    if (!weights || !Array.isArray(weights) || weights.length !== tickers.length) {
      return NextResponse.json({ error: "Weights array must match tickers length" }, { status: 400 });
    }

    const pricesByTicker = await getHistoricalPrices(tickers, start_date);

    // Find common dates
    const allDates = new Set<string>();
    Array.from(pricesByTicker.values()).forEach((prices) => {
      prices.forEach((p) => {
        allDates.add(p.date);
      });
    });
    const dates = Array.from(allDates).sort();

    // Calculate cumulative returns
    const tickerReturns: Map<string, number[]> = new Map();
    const portfolioReturns: number[] = [];

    // Get initial values
    const initialValues = new Map<string, number>();
    Array.from(pricesByTicker.entries()).forEach(([ticker, prices]) => {
      if (prices.length > 0) {
        initialValues.set(ticker, prices[0].close);
      }
    });

    for (const date of dates) {
      let portfolioCumRet = 0;

      for (let i = 0; i < tickers.length; i++) {
        const ticker = tickers[i];
        const prices = pricesByTicker.get(ticker) ?? [];
        const priceOnDate = prices.find((p) => p.date === date);
        const firstPrice = initialValues.get(ticker) ?? 1;
        const currentPrice = priceOnDate?.close ?? firstPrice;

        const cumRet = currentPrice / firstPrice - 1;

        if (!tickerReturns.has(ticker)) {
          tickerReturns.set(ticker, []);
        }
        tickerReturns.get(ticker)!.push(cumRet);

        portfolioCumRet += weights[i] * cumRet;
      }

      portfolioReturns.push(portfolioCumRet);
    }

    const series = [
      ...tickers.map((ticker: string) => ({
        name: ticker,
        data: dates.map((date, i) => ({
          date,
          value: tickerReturns.get(ticker)?.[i] ?? 0,
        })),
      })),
      {
        name: "Portafolio Óptimo",
        data: dates.map((date, i) => ({
          date,
          value: portfolioReturns[i],
        })),
      },
    ];

    return NextResponse.json({ series });
  } catch (error) {
    console.error("Cumulative returns error:", error);
    return NextResponse.json({ error: "Cumulative returns calculation failed" }, { status: 500 });
  }
}
