import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// `db/index.ts` builds its libSQL client at module scope from env.DATABASE_URL,
// so the throwaway database has to exist before anything under test is imported.
const tmpDir = mkdtempSync(join(tmpdir(), "spend-test-"));
process.env.DATABASE_URL = `file:${join(tmpDir, "spend.db")}`;

const { db } = await import("../../db/index.js");
const { creditLedger, user, walletBalance } = await import("../../db/schema.js");
const { grantCredits, spendCredit } = await import("./spend.js");

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "../../../drizzle");

async function seedUser(id: string, credits: number): Promise<void> {
  const now = new Date();
  await db.insert(user).values({
    id,
    name: id,
    email: `${id}@example.com`,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
  await grantCredits({
    userId: id,
    credits,
    reason: "grant",
    idempotencyKey: `seed:${id}`,
  });
}

// The invariant the ledger exists to guarantee: a wallet is the sum of its rows.
async function readWallet(userId: string): Promise<{ credits: number; ledgerSum: number }> {
  const wallet = await db.query.walletBalance.findFirst({
    where: eq(walletBalance.userId, userId),
  });
  const rows = await db.select().from(creditLedger).where(eq(creditLedger.userId, userId));
  return {
    credits: wallet?.credits ?? 0,
    ledgerSum: rows.reduce((sum, row) => sum + row.delta, 0),
  };
}

beforeAll(async () => {
  // Apply the committed migrations, so the test runs against the production schema.
  await migrate(db, { migrationsFolder });
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("spendCredit", () => {
  it("returns the existing row without spending again on a replay", async () => {
    await seedUser("replay-user", 10);

    const first = await spendCredit({
      userId: "replay-user",
      idempotencyKey: "replay-key",
      cost: 3,
    });
    const second = await spendCredit({
      userId: "replay-user",
      idempotencyKey: "replay-key",
      cost: 3,
    });

    expect(second).toEqual(first);
    const { credits, ledgerSum } = await readWallet("replay-user");
    expect(credits).toBe(7);
    expect(credits).toBe(ledgerSum);
  });

  it("rolls back the deduction when another request wins the idempotency race", async () => {
    await seedUser("race-user", 10);
    const winner = await spendCredit({
      userId: "race-user",
      idempotencyKey: "race-key",
      cost: 1,
    });

    // Genuine concurrency cannot reach the losing branch against a local file
    // database — libSQL rejects the overlapping transaction with SQLITE_BUSY
    // before it inserts. Suppressing the replay lookup once puts this call
    // exactly where a race loser lands: past the short-circuit, with the
    // winner's row already committed, so the insert hits the unique index.
    const findFirst = vi.spyOn(db.query.creditLedger, "findFirst");
    findFirst.mockReturnValueOnce(Promise.resolve(undefined) as never);
    try {
      const loser = await spendCredit({
        userId: "race-user",
        idempotencyKey: "race-key",
        cost: 1,
      });
      expect(loser).toEqual(winner);
    } finally {
      findFirst.mockRestore();
    }

    // Before the fix the losing transaction committed, leaving the wallet at 8
    // against a ledger summing to 9.
    const { credits, ledgerSum } = await readWallet("race-user");
    expect(credits).toBe(9);
    expect(credits).toBe(ledgerSum);
  });

  it("leaves the wallet untouched when the balance is insufficient", async () => {
    await seedUser("broke-user", 1);

    await expect(
      spendCredit({ userId: "broke-user", idempotencyKey: "broke-key", cost: 5 })
    ).rejects.toThrow();

    const { credits, ledgerSum } = await readWallet("broke-user");
    expect(credits).toBe(1);
    expect(credits).toBe(ledgerSum);
  });

  // No genuinely-concurrent test here. Two overlapping spends against a local file
  // DB lose to SQLITE_BUSY before either reaches the ledger insert, so such a test
  // passes against the unfixed code as well — it proves nothing — and the rejected
  // transaction leaves the shared client unable to commit, failing whatever runs
  // next. The mocked race above is the real regression proof.
});
