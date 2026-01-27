import YahooFinance from "yahoo-finance2";
import { eq, desc } from "drizzle-orm";
import { db } from "../../db/index.js";
import { funds, prices, backgroundTasks } from "../../db/schema.js";

const yahooFinance = new YahooFinance();

type ProgressCallback = (progress: number, message: string) => void;

export async function startYahooUpdate(taskId: string, onProgress: ProgressCallback): Promise<void> {
  try {
    // Mark task as running
    await db
      .update(backgroundTasks)
      .set({ status: "running", startedAt: new Date() })
      .where(eq(backgroundTasks.id, taskId));

    // Get all funds with Yahoo tickers
    const allFunds = await db.query.funds.findMany({
      where: (funds, { isNotNull }) => isNotNull(funds.yahooTicker),
    });

    const fundsWithTickers = allFunds.filter((f) => f.yahooTicker);
    const total = fundsWithTickers.length;

    if (total === 0) {
      await completeTask(taskId, { message: "No funds with Yahoo tickers found" });
      return;
    }

    let processed = 0;
    let updated = 0;
    let errors: string[] = [];

    for (const fund of fundsWithTickers) {
      // Check if task was cancelled
      const task = await db.query.backgroundTasks.findFirst({
        where: eq(backgroundTasks.id, taskId),
      });
      if (task?.status === "cancelled") {
        return;
      }

      try {
        const ticker = fund.yahooTicker!;
        onProgress((processed / total) * 100, `Updating ${fund.name}...`);

        // Get last price date for this fund
        const lastPrice = await db.query.prices.findFirst({
          where: eq(prices.fundId, fund.id),
          orderBy: [desc(prices.date)],
        });

        const startDate = lastPrice ? new Date(lastPrice.date) : new Date("2020-01-01");
        startDate.setDate(startDate.getDate() + 1); // Start from day after last price

        const endDate = new Date();

        if (startDate >= endDate) {
          processed++;
          continue;
        }

        // Fetch historical data from Yahoo Finance
        const historical = await yahooFinance.historical(ticker, {
          period1: startDate,
          period2: endDate,
        });

        // Insert new prices
        for (const quote of historical) {
          const dateStr = quote.date.toISOString().split("T")[0];
          const price = quote.adjClose ?? quote.close;

          if (price != null) {
            try {
              await db
                .insert(prices)
                .values({
                  fundId: fund.id,
                  date: dateStr,
                  price,
                })
                .onConflictDoNothing();
              updated++;
            } catch {
              // Ignore duplicate errors
            }
          }
        }

        // Small delay to avoid rate limiting
        await sleep(500);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        errors.push(`${fund.name}: ${errorMsg}`);
      }

      processed++;
    }

    // Complete task
    await completeTask(taskId, {
      funds_processed: processed,
      prices_updated: updated,
      errors: errors.length > 0 ? errors : undefined,
    });

    onProgress(100, "Update complete");
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await failTask(taskId, errorMsg);
  }
}

async function completeTask(taskId: string, resultData: object): Promise<void> {
  await db
    .update(backgroundTasks)
    .set({
      status: "completed",
      progress: 100,
      resultData: JSON.stringify(resultData),
      completedAt: new Date(),
    })
    .where(eq(backgroundTasks.id, taskId));
}

async function failTask(taskId: string, errorMessage: string): Promise<void> {
  await db
    .update(backgroundTasks)
    .set({
      status: "failed",
      errorMessage,
      completedAt: new Date(),
    })
    .where(eq(backgroundTasks.id, taskId));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
