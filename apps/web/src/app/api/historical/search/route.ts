import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const q = searchParams.get("q");

  if (!q || q.length < 1) {
    return NextResponse.json({ error: "Query parameter 'q' is required" }, { status: 400 });
  }

  try {
    const results = await yahooFinance.search(q, { quotesCount: 10 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tickers = (results as any).quotes
      .filter((quote: { symbol?: string; quoteType?: string }) =>
        quote.symbol && (quote.quoteType === "EQUITY" || quote.quoteType === "ETF")
      )
      .map((quote: { symbol: string; shortname?: string; longname?: string; exchange?: string; quoteType?: string }) => ({
        symbol: quote.symbol,
        name: quote.shortname || quote.longname || quote.symbol,
        exchange: quote.exchange || "",
        type: quote.quoteType,
      }));

    return NextResponse.json(tickers);
  } catch (error) {
    console.error("Yahoo Finance search error:", error);
    return NextResponse.json([]);
  }
}
