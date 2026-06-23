import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

// Minimal shape of the quote objects returned by Yahoo Finance search; the
// library types these loosely, so we narrow to the fields we actually read.
interface YahooSearchQuote {
  symbol?: string;
  quoteType?: string;
  shortname?: string;
  longname?: string;
  exchange?: string;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const q = searchParams.get("q");

  if (!q || q.length < 1) {
    return NextResponse.json({ error: "Query parameter 'q' is required" }, { status: 400 });
  }

  try {
    const results = await yahooFinance.search(q, { quotesCount: 10 }, { validateResult: false });

    const tickers = (results as { quotes: YahooSearchQuote[] }).quotes
      .filter(
        (quote) => quote.symbol && (quote.quoteType === "EQUITY" || quote.quoteType === "ETF")
      )
      .map((quote) => ({
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
