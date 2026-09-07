import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  backgroundTasks,
  creditLedger,
  organization,
  organizationBranding,
  organizationDomain,
  organizationMember,
  organizationSettings,
  payments,
  simulations,
  user,
  userAssumptions,
  userCorrelations,
  userProfile,
  walletBalance,
} from "../../db/schema.js";
import { authMiddleware } from "../../middleware/auth.js";

const app = new Hono();

// Every route here reads the caller's own organization, resolved from the
// membership row by the middleware — never from a path or query parameter.
app.use("*", authMiddleware);

/** `owner` is the only role allowed to read the whole tenant's data. */
async function isOwner(organizationId: string, userId: string): Promise<boolean> {
  const membership = await db.query.organizationMember.findFirst({
    where: and(
      eq(organizationMember.organizationId, organizationId),
      eq(organizationMember.userId, userId)
    ),
    columns: { role: true },
  });

  return membership?.role === "owner";
}

// GET /api/organizations/branding - the tenant's own branding row
//
// Read by the client so tenant-authored copy (the disclaimer today) can replace
// our default wording. Any member may read it: it is what their own app renders.
app.get("/branding", async (c) => {
  const organizationId = c.get("organizationId");

  const row = await db.query.organizationBranding.findFirst({
    where: eq(organizationBranding.organizationId, organizationId),
  });

  // A tenant with no branding row yet is normal, not an error — the client
  // falls back to our defaults for every field it reads.
  return c.json({
    organizationId,
    productName: row?.productName ?? null,
    productShortName: row?.productShortName ?? null,
    tagline: row?.tagline ?? null,
    accentHex: row?.accentHex ?? null,
    fontKey: row?.fontKey ?? null,
    logoUrl: row?.logoUrl ?? null,
    faviconUrl: row?.faviconUrl ?? null,
    supportEmail: row?.supportEmail ?? null,
    privacyPolicyUrl: row?.privacyPolicyUrl ?? null,
    termsUrl: row?.termsUrl ?? null,
    disclaimerText: row?.disclaimerText ?? null,
  });
});

// GET /api/organizations/export - every row this organization owns, as JSON
//
// A departing tenant asks for their data and the contract usually obliges us to
// hand it over. Rows go out exactly as stored — `params`, `result` and
// `result_data` stay the JSON strings the columns hold — so the dump is a
// faithful copy of the database rather than a re-interpretation of it.
//
// Platform-wide tables (`funds`, `prices`, `index_data`, `credit_packages`) are
// deliberately absent: they are ours, identical for every tenant, and carry no
// `organization_id`.
app.get("/export", async (c) => {
  const organizationId = c.get("organizationId");
  const currentUser = c.get("user");

  if (!(await isOwner(organizationId, currentUser.id))) {
    return c.json({ error: "Only an organization owner can export" }, 403);
  }

  const org = await db.query.organization.findFirst({
    where: eq(organization.id, organizationId),
  });

  if (!org) {
    return c.json({ error: "Organization not found" }, 404);
  }

  // The membership rows alone name users by id, which is useless to a tenant
  // reading the file. The join adds the identity behind each seat.
  const members = await db
    .select({
      id: organizationMember.id,
      userId: organizationMember.userId,
      role: organizationMember.role,
      createdAt: organizationMember.createdAt,
      name: user.name,
      email: user.email,
    })
    .from(organizationMember)
    .innerJoin(user, eq(user.id, organizationMember.userId))
    .where(eq(organizationMember.organizationId, organizationId));

  const [
    branding,
    settings,
    domains,
    profiles,
    assumptions,
    correlations,
    savedSimulations,
    tasks,
    wallet,
    paymentRows,
    ledger,
  ] = await Promise.all([
    db.query.organizationBranding.findFirst({
      where: eq(organizationBranding.organizationId, organizationId),
    }),
    db.query.organizationSettings.findFirst({
      where: eq(organizationSettings.organizationId, organizationId),
    }),
    db.select().from(organizationDomain).where(eq(organizationDomain.organizationId, organizationId)),
    db.select().from(userProfile).where(eq(userProfile.organizationId, organizationId)),
    db.select().from(userAssumptions).where(eq(userAssumptions.organizationId, organizationId)),
    db.select().from(userCorrelations).where(eq(userCorrelations.organizationId, organizationId)),
    db.select().from(simulations).where(eq(simulations.organizationId, organizationId)),
    db.select().from(backgroundTasks).where(eq(backgroundTasks.organizationId, organizationId)),
    db.query.walletBalance.findFirst({
      where: eq(walletBalance.organizationId, organizationId),
    }),
    db.select().from(payments).where(eq(payments.organizationId, organizationId)),
    db.select().from(creditLedger).where(eq(creditLedger.organizationId, organizationId)),
  ]);

  const filename = `organization-${org.slug.replace(/[^a-zA-Z0-9._-]/g, "-")}-${
    new Date().toISOString().slice(0, 10)
  }.json`;
  c.header("Content-Disposition", `attachment; filename="${filename}"`);

  return c.json({
    // Versioned so a later shape change is recognisable in a file someone
    // exported months ago.
    format: "organization-export/1",
    exportedAt: new Date().toISOString(),
    organization: org,
    members,
    branding: branding ?? null,
    settings: settings ?? null,
    domains,
    userProfiles: profiles,
    userAssumptions: assumptions,
    userCorrelations: correlations,
    simulations: savedSimulations,
    backgroundTasks: tasks,
    walletBalance: wallet ?? null,
    payments: paymentRows,
    creditLedger: ledger,
  });
});

export default app;
