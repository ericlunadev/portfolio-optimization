import { sql } from "drizzle-orm";
import { db } from "../../db/index.js";

type DriftRow = { user_id: string; wallet_credits: number; ledger_sum: number };

// Invariant: walletBalance.credits == SUM(creditLedger.delta) for every user.
// If it drifts, that's a data-integrity bug — log loudly and let an operator decide.
export async function assertWalletLedgerInvariant(): Promise<DriftRow[]> {
  const result = await db.run(sql`
    SELECT w.user_id AS user_id,
           w.credits AS wallet_credits,
           COALESCE(SUM(l.delta), 0) AS ledger_sum
    FROM wallet_balance w
    LEFT JOIN credit_ledger l ON l.user_id = w.user_id
    GROUP BY w.user_id, w.credits
    HAVING w.credits != COALESCE(SUM(l.delta), 0)
    UNION ALL
    SELECT l.user_id AS user_id,
           0 AS wallet_credits,
           SUM(l.delta) AS ledger_sum
    FROM credit_ledger l
    LEFT JOIN wallet_balance w ON w.user_id = l.user_id
    WHERE w.user_id IS NULL
    GROUP BY l.user_id
    HAVING SUM(l.delta) != 0
  `);

  const drift = result.rows as unknown as DriftRow[];
  if (drift.length > 0) {
    console.error(
      `[billing] WALLET/LEDGER DRIFT — ${drift.length} user(s):`,
      drift
    );
  }
  return drift;
}
