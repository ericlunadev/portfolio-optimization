import { sql } from "drizzle-orm";
import { db } from "../../db/index.js";

export type DriftRow = {
  organization_id: string;
  wallet_credits: number;
  ledger_sum: number;
};

export type UserKeyedDriftRow = {
  user_id: string;
  wallet_credits: number;
  ledger_sum: number;
};

function reportDrift(rows: unknown[], subject: string): void {
  if (rows.length > 0) {
    console.error(
      `[billing] WALLET/LEDGER DRIFT — ${rows.length} ${subject}(s):`,
      rows
    );
  }
}

// Invariant: walletBalance.credits == SUM(creditLedger.delta) for every organization.
// If it drifts, that's a data-integrity bug — log loudly and let an operator decide.
//
// Keyed on `organization_id` on both sides: the wallet is org-keyed (D7) and the
// ledger carries a nullable `user_id`, so joining on the user would report every
// multi-seat tenant as drifted and invent a phantom row per null-user grant.
export async function assertWalletLedgerInvariant(): Promise<DriftRow[]> {
  const result = await db.run(sql`
    SELECT w.organization_id AS organization_id,
           w.credits AS wallet_credits,
           COALESCE(SUM(l.delta), 0) AS ledger_sum
    FROM wallet_balance w
    LEFT JOIN credit_ledger l ON l.organization_id = w.organization_id
    GROUP BY w.organization_id, w.credits
    HAVING w.credits != COALESCE(SUM(l.delta), 0)
    UNION ALL
    SELECT l.organization_id AS organization_id,
           0 AS wallet_credits,
           SUM(l.delta) AS ledger_sum
    FROM credit_ledger l
    LEFT JOIN wallet_balance w ON w.organization_id = l.organization_id
    WHERE w.organization_id IS NULL
    GROUP BY l.organization_id
    HAVING SUM(l.delta) != 0
  `);

  const drift = result.rows as unknown as DriftRow[];
  reportDrift(drift, "organization");
  return drift;
}

// The same invariant against the pre-whitelabel schema, where the wallet is keyed
// on `user_id` and neither table has an `organization_id` column yet. Kept so the
// drift check can run on both sides of the migration — the org-keyed query above
// fails with `no such column` against the old schema, so one function cannot
// cover both.
export async function assertUserKeyedWalletLedgerInvariant(): Promise<
  UserKeyedDriftRow[]
> {
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

  const drift = result.rows as unknown as UserKeyedDriftRow[];
  reportDrift(drift, "user");
  return drift;
}
