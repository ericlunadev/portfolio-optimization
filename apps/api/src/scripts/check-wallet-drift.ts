// One-shot script: checks the wallet/ledger invariant and exits non-zero if it
// has drifted. Run it on both sides of the whitelabel migration — before, to
// prove the books balanced going in; after, to prove the re-key did not lose
// anything.
//
// Usage (from apps/api):
//   pnpm check:wallet-drift                 organization-keyed (post-migration)
//   pnpm check:wallet-drift --user-keyed    user-keyed (pre-migration schema)
//
// DATABASE_URL defaults to file:portfolio.db, so point it at the target first:
//   DATABASE_URL=file:./prod-copy.db pnpm check:wallet-drift

import {
  assertUserKeyedWalletLedgerInvariant,
  assertWalletLedgerInvariant,
} from "../lib/billing/reconcile.js";

async function main() {
  // The old schema has no `organization_id` on either table, so the org-keyed
  // query fails there with `no such column` rather than reporting drift.
  const userKeyed = process.argv.includes("--user-keyed");
  const subject = userKeyed ? "user" : "organization";

  console.log(`Checking the wallet/ledger invariant, keyed on ${subject}...`);
  const drift = userKeyed
    ? await assertUserKeyedWalletLedgerInvariant()
    : await assertWalletLedgerInvariant();

  if (drift.length > 0) {
    console.error(`\n✗ ${drift.length} ${subject}(s) drifted. Listed above.`);
    process.exit(1);
  }

  console.log("✓ No drift: every wallet equals the sum of its ledger rows.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
