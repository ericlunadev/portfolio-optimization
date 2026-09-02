import YahooFinance from "yahoo-finance2";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { prices, backgroundTasks } from "../../db/schema.js";

const yahooFinance = new YahooFinance();

type ProgressCallback = (progress: number, message: string) => void;

// Identifies a background_tasks row. Both keys are needed by every read and write
// here, so they travel together instead of as two loose strings the caller could
// swap without the compiler noticing.
export type TaskRef = {
  taskId: string;
  organizationId: string;
};

export async function startYahooUpdate(task: TaskRef, onProgress: ProgressCallback): Promise<void> {
  try {
    // Mark task as running
    await db
      .update(backgroundTasks)
      .set({ status: "running", startedAt: new Date() })
      .where(
        and(
          eq(backgroundTasks.id, task.taskId),
          eq(backgroundTasks.organizationId, task.organizationId)
        )
      );

    // Get all funds with Yahoo tickers
    const allFunds = await db.query.funds.findMany({
      where: (funds, { isNotNull }) => isNotNull(funds.yahooTicker),
    });

    const fundsWithTickers = allFunds.filter((f) => f.yahooTicker);
    const total = fundsWithTickers.length;

    if (total === 0) {
      await completeTask(task, { message: "No funds with Yahoo tickers found" });
      return;
    }

    let processed = 0;
    let updated = 0;
    const errors: string[] = [];

    const lastPriceRows = await db
      .select({
        fundId: prices.fundId,
        lastDate: sql<string>`max(${prices.date})`.as("last_date"),
      })
      .from(prices)
      .where(inArray(prices.fundId, fundsWithTickers.map((f) => f.id)))
      .groupBy(prices.fundId);
    const lastDateByFundId = new Map(lastPriceRows.map((r) => [r.fundId, r.lastDate]));

    for (const fund of fundsWithTickers) {
      // Check if task was cancelled
      const current = await db.query.backgroundTasks.findFirst({
        where: and(
          eq(backgroundTasks.id, task.taskId),
          eq(backgroundTasks.organizationId, task.organizationId)
        ),
      });
      if (current?.status === "cancelled") {
        return;
      }

      try {
        const ticker = fund.yahooTicker!;
        onProgress((processed / total) * 100, `Updating ${fund.name}...`);

        const lastDate = lastDateByFundId.get(fund.id);
        const startDate = lastDate ? new Date(lastDate) : new Date("2020-01-01");
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

        // Insert new prices. The price table is platform-wide reference data shared
        // by every tenant (D1), so it stays unscoped — only the bookkeeping row above
        // belongs to an organization.
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
    await completeTask(task, {
      funds_processed: processed,
      prices_updated: updated,
      errors: errors.length > 0 ? errors : undefined,
    });

    onProgress(100, "Update complete");
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await failTask(task, errorMsg);
  }
}

async function completeTask(task: TaskRef, resultData: object): Promise<void> {
  await db
    .update(backgroundTasks)
    .set({
      status: "completed",
      progress: 100,
      resultData: JSON.stringify(resultData),
      completedAt: new Date(),
    })
    .where(
      and(
        eq(backgroundTasks.id, task.taskId),
        eq(backgroundTasks.organizationId, task.organizationId)
      )
    );
}

async function failTask(task: TaskRef, errorMessage: string): Promise<void> {
  await db
    .update(backgroundTasks)
    .set({
      status: "failed",
      errorMessage,
      completedAt: new Date(),
    })
    .where(
      and(
        eq(backgroundTasks.id, task.taskId),
        eq(backgroundTasks.organizationId, task.organizationId)
      )
    );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
