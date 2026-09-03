import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The low-balance warning is the only outbound side effect in this module, and
// the real client throws without RESEND_API_KEY. Stubbing the transport keeps
// the assertions on *when* a warning goes out and to whom.
vi.mock("../email/send.js", () => ({ sendEmail: vi.fn(async () => {}) }));

// `db/index.ts` builds its libSQL client at module scope from env.DATABASE_URL,
// so the throwaway database has to exist before anything under test is imported.
const tmpDir = mkdtempSync(join(tmpdir(), "spend-test-"));
process.env.DATABASE_URL = `file:${join(tmpDir, "spend.db")}`;

const { db } = await import("../../db/index.js");
const {
  creditLedger,
  organization,
  organizationMember,
  organizationSettings,
  user,
  walletBalance,
} = await import("../../db/schema.js");
const { grantCredits, spendCredit } = await import("./spend.js");
const { clientIdempotencyKey } = await import("./metering.js");
const { emailMessages } = await import("../email/i18n.js");
const { LowBalance } = await import("../email/templates/LowBalance.js");
const { render } = await import("@react-email/render");
const sendEmail = vi.mocked((await import("../email/send.js")).sendEmail);

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "../../../drizzle");

// `settings` is omitted by most tests on purpose: an organization with no
// `organization_settings` row is the state the overdraft lookup has to read as
// zero, and it is what every test written before Task 2.2 already exercised.
async function seedOrg(
  organizationId: string,
  settings?: { overdraftLimit: number }
): Promise<void> {
  await db.insert(organization).values({
    id: organizationId,
    slug: organizationId,
    name: organizationId,
  });
  if (settings) {
    await db.insert(organizationSettings).values({
      organizationId,
      overdraftLimit: settings.overdraftLimit,
    });
  }
}

// The wallet is keyed on the organization, so credits are granted to the org and
// only attributed to the user. `credits: 0` seeds a wallet that was never topped
// up at all — no grant, and therefore no ledger row to measure a warning against.
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
  if (credits > 0) {
    await grantCredits({
      organizationId,
      userId: id,
      credits,
      reason: "grant",
      idempotencyKey: `seed:${id}`,
    });
  }
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

beforeEach(() => {
  sendEmail.mockClear();
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

describe("spendCredit overdraft", () => {
  // The regression test for Task 2.2's promise that a limit of 0 changes nothing:
  // spending the balance down to exactly zero still works, one credit past it
  // still 402s, and the wallet is untouched by the refusal.
  it("with a limit of 0, behaves exactly as it did before overdraft existed", async () => {
    await seedOrg("overdraft-zero-org", { overdraftLimit: 0 });
    await seedUser("overdraft-zero-org", "overdraft-zero-user", 5);

    const drained = await spendCredit({
      organizationId: "overdraft-zero-org",
      userId: "overdraft-zero-user",
      idempotencyKey: "zero-1",
      cost: 5,
    });
    expect(drained.balanceAfter).toBe(0);

    await expect(
      spendCredit({
        organizationId: "overdraft-zero-org",
        userId: "overdraft-zero-user",
        idempotencyKey: "zero-2",
        cost: 1,
      })
    ).rejects.toThrow("INSUFFICIENT_CREDITS");

    const { credits, ledgerSum } = await readWallet("overdraft-zero-org");
    expect(credits).toBe(0);
    expect(credits).toBe(ledgerSum);
  });

  it("allows a spend that lands exactly on the overdraft floor", async () => {
    await seedOrg("overdraft-org", { overdraftLimit: 5 });
    await seedUser("overdraft-org", "overdraft-user", 2);

    // 2 - 7 = -5, the floor itself. The analyst is not blocked mid-meeting.
    const spend = await spendCredit({
      organizationId: "overdraft-org",
      userId: "overdraft-user",
      idempotencyKey: "od-1",
      cost: 7,
    });
    expect(spend.balanceAfter).toBe(-5);

    // And nothing more: the next credit is one past the limit.
    await expect(
      spendCredit({
        organizationId: "overdraft-org",
        userId: "overdraft-user",
        idempotencyKey: "od-2",
        cost: 1,
      })
    ).rejects.toThrow("INSUFFICIENT_CREDITS");

    const { credits, ledgerSum } = await readWallet("overdraft-org");
    expect(credits).toBe(-5);
    expect(credits).toBe(ledgerSum);
  });

  it("refuses a single spend that would land one credit past the floor", async () => {
    await seedOrg("overdraft-edge-org", { overdraftLimit: 5 });
    await seedUser("overdraft-edge-org", "overdraft-edge-user", 2);

    await expect(
      spendCredit({
        organizationId: "overdraft-edge-org",
        userId: "overdraft-edge-user",
        idempotencyKey: "edge-1",
        cost: 8,
      })
    ).rejects.toThrow("INSUFFICIENT_CREDITS");

    const { credits, ledgerSum } = await readWallet("overdraft-edge-org");
    expect(credits).toBe(2);
    expect(credits).toBe(ledgerSum);
  });

  // The guard is per-statement, not per-cycle: the floor has to hold no matter
  // how many spends are attempted against a wallet already deep in overdraft.
  it("cannot be walked past the floor by repeated spends", async () => {
    await seedOrg("overdraft-floor-org", { overdraftLimit: 10 });
    await seedUser("overdraft-floor-org", "overdraft-floor-user", 10);

    let refusals = 0;
    for (let i = 0; i < 12; i++) {
      try {
        await spendCredit({
          organizationId: "overdraft-floor-org",
          userId: "overdraft-floor-user",
          idempotencyKey: `floor-${i}`,
          cost: 3,
        });
      } catch {
        refusals++;
      }
    }

    const { credits, ledgerSum } = await readWallet("overdraft-floor-org");
    expect(refusals).toBeGreaterThan(0);
    expect(credits).toBeGreaterThanOrEqual(-10);
    expect(credits).toBe(ledgerSum);
  });

  it("treats an organization with no settings row as having no overdraft", async () => {
    await seedOrg("no-settings-org");
    await seedUser("no-settings-org", "no-settings-user", 3);

    await expect(
      spendCredit({
        organizationId: "no-settings-org",
        userId: "no-settings-user",
        idempotencyKey: "no-settings-1",
        cost: 4,
      })
    ).rejects.toThrow("INSUFFICIENT_CREDITS");

    const { credits, ledgerSum } = await readWallet("no-settings-org");
    expect(credits).toBe(3);
    expect(credits).toBe(ledgerSum);
  });
});

describe("low-balance warning", () => {
  it("warns the owner on the spend that crosses 20% of the last top-up, and only then", async () => {
    await seedOrg("low-org");
    // The seed grant is the last top-up: 100 credits, so the threshold is 20.
    await seedUser("low-org", "low-owner", 100);

    await spendCredit({
      organizationId: "low-org",
      userId: "low-owner",
      idempotencyKey: "low-1",
      cost: 79,
    });
    expect(sendEmail).not.toHaveBeenCalled();

    await spendCredit({
      organizationId: "low-org",
      userId: "low-owner",
      idempotencyKey: "low-2",
      cost: 1,
    });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0]).toMatchObject({
      to: "low-owner@example.com",
      subject: emailMessages.es.lowBalanceSubject,
    });

    // Every later spend in the cycle starts below the threshold, so it crosses
    // nothing. This is the assertion that keeps the warning off every request.
    await spendCredit({
      organizationId: "low-org",
      userId: "low-owner",
      idempotencyKey: "low-3",
      cost: 1,
    });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  // Also pins down which top-up counts: the threshold has to follow the *latest*
  // one, so a smaller second purchase lowers it rather than leaving the first
  // purchase's threshold in place.
  it("warns again after the next top-up re-arms the threshold", async () => {
    await seedOrg("rearm-org");
    await seedUser("rearm-org", "rearm-owner", 100);

    await spendCredit({
      organizationId: "rearm-org",
      userId: "rearm-owner",
      idempotencyKey: "rearm-1",
      cost: 80,
    });
    expect(sendEmail).toHaveBeenCalledTimes(1);

    // 20 + 50 = 70 credits, and the threshold is now 10, not 20.
    await grantCredits({
      organizationId: "rearm-org",
      userId: "rearm-owner",
      credits: 50,
      reason: "purchase",
      idempotencyKey: "rearm-topup",
    });

    await spendCredit({
      organizationId: "rearm-org",
      userId: "rearm-owner",
      idempotencyKey: "rearm-2",
      cost: 55,
    });
    expect(sendEmail).toHaveBeenCalledTimes(1);

    await spendCredit({
      organizationId: "rearm-org",
      userId: "rearm-owner",
      idempotencyKey: "rearm-3",
      cost: 6,
    });
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  // A client retry is the same spend, not a second crossing.
  it("does not warn again when the same request is replayed", async () => {
    await seedOrg("replay-warn-org");
    await seedUser("replay-warn-org", "replay-warn-owner", 100);

    const first = await spendCredit({
      organizationId: "replay-warn-org",
      userId: "replay-warn-owner",
      idempotencyKey: "replay-warn-key",
      cost: 85,
    });
    const second = await spendCredit({
      organizationId: "replay-warn-org",
      userId: "replay-warn-owner",
      idempotencyKey: "replay-warn-key",
      cost: 85,
    });

    expect(second).toEqual(first);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  // `notifyLowBalance` swallows its own failures so a warning cannot break a
  // spend that already committed — which means a template that throws would drop
  // every warning silently. This is the test that would notice.
  it("renders in both locales", async () => {
    for (const locale of ["es", "en"] as const) {
      const html = await render(
        LowBalance({
          locale,
          organizationName: "Acme Capital",
          credits: -3,
          topUpUrl: "https://app.test/billing",
        })
      );

      expect(html).toContain("Acme Capital");
      expect(html).toContain(emailMessages[locale].lowBalanceBalance(-3));
      expect(html).toContain(emailMessages[locale].lowBalanceButton);
      expect(html).toContain("https://app.test/billing");
    }
  });

  // An invoiced tenant provisioned with overdraft but not yet granted anything:
  // there is no top-up to take 20% of, so there is nothing to warn about.
  it("stays quiet when the organization has never been topped up", async () => {
    await seedOrg("never-topped-org", { overdraftLimit: 5 });
    await seedUser("never-topped-org", "never-topped-owner", 0);

    const spend = await spendCredit({
      organizationId: "never-topped-org",
      userId: "never-topped-owner",
      idempotencyKey: "never-1",
      cost: 3,
    });

    expect(spend.balanceAfter).toBe(-3);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
