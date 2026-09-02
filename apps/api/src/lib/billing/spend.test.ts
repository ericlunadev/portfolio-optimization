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
const { creditLedger, organization, organizationMember, user, walletBalance } =
  await import("../../db/schema.js");
const { grantCredits, spendCredit } = await import("./spend.js");
const { clientIdempotencyKey } = await import("./metering.js");

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "../../../drizzle");

async function seedOrg(organizationId: string): Promise<void> {
  await db.insert(organization).values({
    id: organizationId,
    slug: organizationId,
    name: organizationId,
  });
}

// The wallet is keyed on the organization, so credits are granted to the org and
// only attributed to the user.
async function seedUser(
  organizationId: string,
  id: string,
  credits: number
): Promise<void> {
  const now = new Date();
  await db.insert(user).values({
    id,
    name: id,
    email: `${id}@example.com`,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(organizationMember).values({
    id: `member-${id}`,
    organizationId,
    userId: id,
    role: "owner",
  });
  await grantCredits({
    organizationId,
    userId: id,
    credits,
    reason: "grant",
    idempotencyKey: `seed:${id}`,
  });
}

// The invariant the ledger exists to guarantee: a wallet is the sum of its rows.
async function readWallet(
  organizationId: string
): Promise<{ credits: number; ledgerSum: number }> {
  const wallet = await db.query.walletBalance.findFirst({
    where: eq(walletBalance.organizationId, organizationId),
  });
  const rows = await db
    .select()
    .from(creditLedger)
    .where(eq(creditLedger.organizationId, organizationId));
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
    await seedOrg("replay-org");
    await seedUser("replay-org", "replay-user", 10);

    const first = await spendCredit({
      organizationId: "replay-org",
      userId: "replay-user",
      idempotencyKey: "replay-key",
      cost: 3,
    });
    const second = await spendCredit({
      organizationId: "replay-org",
      userId: "replay-user",
      idempotencyKey: "replay-key",
      cost: 3,
    });

    expect(second).toEqual(first);
    const { credits, ledgerSum } = await readWallet("replay-org");
    expect(credits).toBe(7);
    expect(credits).toBe(ledgerSum);
  });

  it("does not replay another organization's row for the same key", async () => {
    await seedOrg("tenant-a");
    await seedUser("tenant-a", "tenant-a-analyst", 10);
    await seedOrg("tenant-b");
    await seedUser("tenant-b", "tenant-b-analyst", 10);

    const a = await spendCredit({
      organizationId: "tenant-a",
      userId: "tenant-a-analyst",
      idempotencyKey: "guessable-key",
      cost: 3,
    });
    const b = await spendCredit({
      organizationId: "tenant-b",
      userId: "tenant-b-analyst",
      idempotencyKey: "guessable-key",
      cost: 3,
    });

    // Bug B1: the lookup matched on the key alone, so tenant B was handed
    // tenant A's ledger row and kept its credits. `idempotency_key` is a raw
    // client header on the metered routes, so the key is the attacker's to pick.
    expect(b.ledgerId).not.toBe(a.ledgerId);

    const walletA = await readWallet("tenant-a");
    expect(walletA.credits).toBe(7);
    expect(walletA.credits).toBe(walletA.ledgerSum);

    const walletB = await readWallet("tenant-b");
    expect(walletB.credits).toBe(7);
    expect(walletB.credits).toBe(walletB.ledgerSum);
  });

  // Bug B1's live exploit: the server writes `signup-grant:<user id>` and
  // `purchase:<checkout session id>`, both of which a caller can reconstruct from
  // values they already hold. Sent as an `Idempotency-Key` on a metered route,
  // either one used to replay that earlier *credit* row and spend nothing.
  it("does not let a caller replay their own grant to get a free spend", async () => {
    await seedOrg("self-replay-org");
    // seedUser grants under `seed:<id>` — the same shape as `signup-grant:<id>`.
    await seedUser("self-replay-org", "self-replay-user", 10);

    // What a route actually passes down, having namespaced the client's header.
    const forged = clientIdempotencyKey("seed:self-replay-user");
    expect(forged).not.toBe("seed:self-replay-user");

    const spend = await spendCredit({
      organizationId: "self-replay-org",
      userId: "self-replay-user",
      idempotencyKey: forged,
      cost: 4,
    });

    // Charged, not handed back the +10 grant row.
    expect(spend.balanceAfter).toBe(6);
    const { credits, ledgerSum } = await readWallet("self-replay-org");
    expect(credits).toBe(6);
    expect(credits).toBe(ledgerSum);
  });

  // Defence in depth, for a caller who reaches spendCredit with an unnamespaced
  // key anyway. The `reason` filter stops the free spend; the composite unique
  // index then rejects the insert, so this fails loudly instead of paying out.
  // No route can produce this — `clientIdempotencyKey` prefixes every client key.
  it("refuses a spend that collides with a credit row's key", async () => {
    await seedOrg("collide-org");
    await seedUser("collide-org", "collide-user", 10);

    await expect(
      spendCredit({
        organizationId: "collide-org",
        userId: "collide-user",
        idempotencyKey: "seed:collide-user",
        cost: 4,
      })
    ).rejects.toThrow();

    const { credits, ledgerSum } = await readWallet("collide-org");
    expect(credits).toBe(10);
    expect(credits).toBe(ledgerSum);
  });

  it("rolls back the deduction when another request wins the idempotency race", async () => {
    await seedOrg("race-org");
    await seedUser("race-org", "race-user", 10);
    const winner = await spendCredit({
      organizationId: "race-org",
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
        organizationId: "race-org",
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
    const { credits, ledgerSum } = await readWallet("race-org");
    expect(credits).toBe(9);
    expect(credits).toBe(ledgerSum);
  });

  it("leaves the wallet untouched when the balance is insufficient", async () => {
    await seedOrg("broke-org");
    await seedUser("broke-org", "broke-user", 1);

    await expect(
      spendCredit({
        organizationId: "broke-org",
        userId: "broke-user",
        idempotencyKey: "broke-key",
        cost: 5,
      })
    ).rejects.toThrow();

    const { credits, ledgerSum } = await readWallet("broke-org");
    expect(credits).toBe(1);
    expect(credits).toBe(ledgerSum);
  });

  // No genuinely-concurrent test here. Two overlapping spends against a local file
  // DB lose to SQLITE_BUSY before either reaches the ledger insert, so such a test
  // passes against the unfixed code as well — it proves nothing — and the rejected
  // transaction leaves the shared client unable to commit, failing whatever runs
  // next. The mocked race above is the real regression proof.
});
