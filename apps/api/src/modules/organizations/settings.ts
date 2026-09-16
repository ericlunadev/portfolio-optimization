import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { organization, organizationSettings } from "../../db/schema.js";
import { authMiddleware } from "../../middleware/auth.js";
import { resolveAdvisorConfig } from "../../lib/advisor.js";

// The product switches the client needs before it renders anything: whether
// Academia exists for this tenant, and whether the advisor CTA does.
//
// This is the smallest honest mechanism, not the final one. PLAN Phase 1 builds
// host-based tenant resolution in `apps/web/src/middleware.ts` and a tenant
// config injected by the root layout; this endpoint should be folded into it
// then, so the switches are known before first paint instead of one fetch later.

const app = new Hono();

// The organization comes from the membership row the middleware resolved, never
// from a path or query parameter.
app.use("*", authMiddleware);

/** Matches `organization_settings.academia_enabled`'s column default. */
const ACADEMIA_ENABLED_FALLBACK = true;

// GET /api/organizations/settings
app.get("/settings", async (c) => {
  const organizationId = c.get("organizationId");

  const [settings, org, advisor] = await Promise.all([
    db.query.organizationSettings.findFirst({
      where: eq(organizationSettings.organizationId, organizationId),
      columns: { academiaEnabled: true },
    }),
    db.query.organization.findFirst({
      where: eq(organization.id, organizationId),
      columns: { name: true },
    }),
    resolveAdvisorConfig(organizationId),
  ]);

  return c.json({
    academiaEnabled: settings?.academiaEnabled ?? ACADEMIA_ENABLED_FALLBACK,
    advisor: {
      mode: advisor.mode,
      bookable: advisor.bookable,
      costCredits: advisor.costCredits,
      // The advisor's identity travels as data so no translated string has to
      // bake in a possessive a tenant would inherit. Only a tenant's own advisor
      // is named; `platform` keeps the product's generic wording.
      providerName: advisor.mode === "tenant" ? org?.name ?? null : null,
    },
    // `advisor.bookingUrl` is deliberately absent: revealing it is what
    // POST /api/billing/advisor-call charges credits for.
  });
});

export default app;
