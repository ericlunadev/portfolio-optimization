// One-shot script: seeds the default (D2C) organization for local development.
//
// Every authenticated request resolves a tenant from organization_member
// (middleware/auth.ts throws 500 when it cannot), so a database with no
// organization is a database where nothing works. Run this once against a fresh
// file:portfolio.db, right after `pnpm db:migrate`, before signing up.
//
// It writes the same ids and values as migration 0007's backfill, so the two
// converge on one default tenant instead of racing to create two, and it adds
// the `localhost` domain row that the migration deliberately does not write.
//
// Usage (from apps/api):  pnpm seed:dev-org
//
// DATABASE_URL defaults to file:portfolio.db, so point it at the target first if
// it lives elsewhere:
//   DATABASE_URL=file:./scratch.db pnpm seed:dev-org
//
// Idempotent: every step skips when its row already exists. Safe to run twice.

import { eq, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  organization,
  organizationBranding,
  organizationDomain,
  organizationMember,
  organizationSettings,
  user,
} from "../db/schema.js";

// Same ids as drizzle/0007_backfill_organizations.sql. Changing one here without
// changing it there gives a migrated database two default tenants.
const ORG_ID = "org-d2c";
const ORG_SLUG = "d2c";
const ORG_NAME = "Optimización de Portafolio";
const DOMAIN_ID = "dom-d2c-localhost";
// The dev Host header is `localhost:3000`, so Task 1.1's lookup has to strip the
// port before matching this row.
const DEV_HOSTNAME = "localhost";

async function seedOrganization(): Promise<string> {
  const current = await db.query.organization.findFirst({
    where: eq(organization.isDefault, true),
  });
  if (current) {
    console.log(`✓ organization: '${current.slug}' is already the default tenant, skipping`);
    return current.id;
  }

  const existing = await db.query.organization.findFirst({
    where: eq(organization.id, ORG_ID),
  });
  if (existing) {
    // Task 1.1 serves this organization for any unknown host, so exactly one row
    // has to carry the flag.
    await db.update(organization).set({ isDefault: true }).where(eq(organization.id, ORG_ID));
    console.log(`✓ organization: marked '${existing.slug}' as the default tenant`);
    return existing.id;
  }

  await db.insert(organization).values({
    id: ORG_ID,
    slug: ORG_SLUG,
    name: ORG_NAME,
    tier: "cobranded",
    isDefault: true,
  });
  console.log(`✓ organization: created '${ORG_SLUG}' (${ORG_ID})`);
  return ORG_ID;
}

async function seedSettings(organizationId: string): Promise<void> {
  const existing = await db.query.organizationSettings.findFirst({
    where: eq(organizationSettings.organizationId, organizationId),
  });
  if (existing) {
    console.log("✓ organization_settings: already seeded, skipping");
    return;
  }

  // Today's D2C behaviour, not the schema.ts column defaults — those ('off', no
  // crypto rail) are the *whitelabel* defaults, and using them here would hide
  // the advisor CTA and the crypto rail tab from local development.
  await db.insert(organizationSettings).values({
    organizationId,
    academiaEnabled: true,
    advisorMode: "platform",
    advisorBookingUrl: null,
    advisorCostCredits: 100,
    cryptoRailEnabled: true,
    fundAllowlist: null,
    overdraftLimit: 0,
    signupGrantCredits: 3,
  });
  console.log("✓ organization_settings: seeded (advisor_mode=platform, crypto rail on, 3 signup credits)");
}

async function seedBranding(organizationId: string): Promise<void> {
  const existing = await db.query.organizationBranding.findFirst({
    where: eq(organizationBranding.organizationId, organizationId),
  });
  if (existing) {
    console.log("✓ organization_branding: already seeded, skipping");
    return;
  }

  // supportEmail, privacyPolicyUrl and termsUrl stay NULL: no value for any of
  // them exists in the repo yet. Only the provisioning CLI insists on them.
  await db.insert(organizationBranding).values({
    organizationId,
    productName: ORG_NAME,
    productShortName: "Optim.",
    tagline: "Optimización de portafolio basada en la teoría de Markowitz",
    accentHex: "#d7a042",
    fontKey: "instrument-sans",
  });
  console.log("✓ organization_branding: seeded");
}

async function seedDomain(organizationId: string): Promise<void> {
  const existing = await db.query.organizationDomain.findFirst({
    where: eq(organizationDomain.hostname, DEV_HOSTNAME),
  });
  if (existing) {
    console.log(`✓ organization_domain: '${DEV_HOSTNAME}' already mapped, skipping`);
    return;
  }

  // On a migrated database the production hostname is already there and keeps
  // is_primary; this row only has to make host lookup resolve in dev.
  const siblings = await db
    .select({ id: organizationDomain.id })
    .from(organizationDomain)
    .where(eq(organizationDomain.organizationId, organizationId));

  await db.insert(organizationDomain).values({
    id: DOMAIN_ID,
    organizationId,
    hostname: DEV_HOSTNAME,
    isPrimary: siblings.length === 0,
  });
  console.log(`✓ organization_domain: '${DEV_HOSTNAME}' → ${organizationId}`);
}

// Not a fix, just a diagnosis: a user with no membership row gets a 500 on every
// authenticated request, and the error alone does not say why.
async function warnAboutUsersWithoutOrganization(): Promise<number> {
  const orphans = await db
    .select({ email: user.email })
    .from(user)
    .leftJoin(organizationMember, eq(organizationMember.userId, user.id))
    .where(isNull(organizationMember.id));

  if (orphans.length > 0) {
    console.warn(
      `\n! ${orphans.length} user(s) have no organization_member row and will get a 500 on every ` +
        `authenticated request: ${orphans.map((o) => o.email).join(", ")}`
    );
  }

  return orphans.length;
}

async function main() {
  const organizationId = await seedOrganization();
  await seedSettings(organizationId);
  await seedBranding(organizationId);
  await seedDomain(organizationId);
  const orphans = await warnAboutUsersWithoutOrganization();

  console.log(
    orphans === 0
      ? "\nDone. `pnpm dev` and signup work against this database now."
      : "\nDone. The default tenant is in place; the accounts listed above still need one."
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
