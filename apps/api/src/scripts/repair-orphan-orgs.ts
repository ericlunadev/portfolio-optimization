// One-shot repair: gives an organization to every user who has none.
//
// This exists because of a narrow but unrecoverable failure. BetterAuth commits
// the `user` row before `databaseHooks.user.create.after` runs, so if
// provisioning throws — a transient database error is enough — the account is
// left with no `organization_member` row. `middleware/auth.ts` then answers every
// authenticated request with a 500, and signing up again returns 422
// USER_ALREADY_EXISTS: the person can neither use the app nor recreate the
// account. Nothing else in the system repairs that.
//
// It reuses `provisionOrganizationForUser`, which is idempotent, so running this
// against a healthy database is a no-op.
//
// Usage (from apps/api):  pnpm repair:orphan-orgs
//
// DATABASE_URL defaults to file:portfolio.db; point it at the target first if it
// lives elsewhere:
//   DATABASE_URL=file:./scratch.db pnpm repair:orphan-orgs

import { eq, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { organizationMember, user } from "../db/schema.js";
import { provisionOrganizationForUser } from "../lib/auth.js";

async function main(): Promise<void> {
  const orphans = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .leftJoin(organizationMember, eq(organizationMember.userId, user.id))
    .where(isNull(organizationMember.id));

  if (orphans.length === 0) {
    console.log("[repair] every user already has an organization");
    return;
  }

  console.log(`[repair] ${orphans.length} user(s) without an organization`);

  let repaired = 0;
  for (const orphan of orphans) {
    try {
      await provisionOrganizationForUser(orphan);
      repaired += 1;
      console.log(`[repair] provisioned an organization for ${orphan.id}`);
    } catch (error) {
      // Keep going: one bad row must not strand the rest.
      console.error(`[repair] failed for ${orphan.id}:`, error);
    }
  }

  console.log(`[repair] done — ${repaired}/${orphans.length} repaired`);
  if (repaired < orphans.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[repair] fatal:", error);
  process.exit(1);
});
