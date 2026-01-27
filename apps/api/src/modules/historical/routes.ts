import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

const historical = new Hono();

// GET /api/historical/search - Search for tickers via Yahoo Finance
historical.get(
  "/search",
  zValidator(
    "query",
    z.object({
      q: z.string().min(1),
    })
  ),
  async (c) => {
    const { q } = c.req.valid("query");

    try {
      const results = await yahooFinance.search(q, { quotesCount: 10 });

      const tickers = results.quotes
        .filter((quote: any) => quote.symbol && (quote.quoteType === "EQUITY" || quote.quoteType === "ETF"))
        .map((quote: any) => ({
          symbol: quote.symbol,
          name: quote.shortname || quote.longname || quote.symbol,
          exchange: quote.exchange || "",
          type: quote.quoteType,
        }));

      return c.json(tickers);
    } catch (error) {
      console.error("Yahoo Finance search error:", error);
      return c.json([]);
    }
  }
);

export default historical;
