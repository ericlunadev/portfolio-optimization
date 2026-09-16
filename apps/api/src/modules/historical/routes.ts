import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import YahooFinance from "yahoo-finance2";
import { db } from "../../db/index.js";
import { organizationMember } from "../../db/schema.js";
import { auth } from "../../lib/auth.js";
import { getFundAllowlist, isTickerAllowed } from "../../lib/tenant-settings.js";

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

const historical = new Hono();

// How many results the caller gets back, unchanged from before the allowlist.
const MAX_RESULTS = 10;

// Yahoo ranks by relevance across every instrument it knows, so with an
// allowlist in force its top ten can be almost entirely disallowed and the
// analyst sees nothing for a fund their firm actually approved. Ask for a wider
// candidate set in that case only — the unrestricted request is byte-identical
// to what it was.
const RESTRICTED_CANDIDATE_COUNT = 30;

/**
 * The caller's organization, or `null` when there is no session.
 *
 * This route is public — it is not behind `authMiddleware` and predates tenancy —
 * so an anonymous caller keeps today's unrestricted search rather than getting a
 * 401. The membership lookup duplicates the private resolver in
 * `middleware/auth.ts`, which throws on a miss; here a miss is an ordinary
 * outcome and not an error.
 */
async function resolveOptionalOrganizationId(c: Context): Promise<string | null> {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  const userId = session?.user?.id;
  if (!userId) return null;

  const membership = await db.query.organizationMember.findFirst({
    where: eq(organizationMember.userId, userId),
    columns: { organizationId: true },
  });

  return membership?.organizationId ?? null;
}

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

    // PLAN Task 3.1: a tenant may restrict search to the funds it has approved.
    const organizationId = await resolveOptionalOrganizationId(c);
    const allowlist = organizationId ? await getFundAllowlist(organizationId) : null;

    try {
      // `validateResult: false` widens the library's return type to `unknown`.
      const results = (await yahooFinance.search(
        q,
        { quotesCount: allowlist ? RESTRICTED_CANDIDATE_COUNT : MAX_RESULTS },
        { validateResult: false }
      )) as { quotes: YahooSearchQuote[] };

      const tickers = results.quotes
        .filter(
          (quote): quote is YahooSearchQuote & { symbol: string } =>
            Boolean(quote.symbol) && (quote.quoteType === "EQUITY" || quote.quoteType === "ETF")
        )
        .filter((quote) => isTickerAllowed(allowlist, quote.symbol))
        .slice(0, MAX_RESULTS)
        .map((quote) => ({
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
