import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { organizationSettings, userProfile, type UserProfile } from "../../db/schema.js";
import { authMiddleware } from "../../middleware/auth.js";
import { grantCredits } from "../../lib/billing/spend.js";

// Fallback only — the real amount lives in `organization_settings.signup_grant_credits`.
const SIGNUP_GRANT_CREDITS = 3;

const app = new Hono();

app.use("*", authMiddleware);

const EXPERIENCE = ["none", "beginner", "intermediate", "advanced"] as const;
const HORIZON = ["short", "medium", "long"] as const;
const RISK_BEHAVIOR = ["sell_all", "sell_some", "hold", "buy_more"] as const;
const GOAL = ["retirement", "growth", "preservation", "specific"] as const;
const MARKETS = ["MX", "US", "EU", "LATAM", "AR", "CRYPTO"] as const;
const CONCEPTS = ["markowitz", "sharpe", "volatility", "beta", "frontier"] as const;

function deriveRiskTolerance(behavior: (typeof RISK_BEHAVIOR)[number]): string {
  if (behavior === "sell_all") return "conservative";
  if (behavior === "buy_more") return "aggressive";
  return "moderate";
}

type Serialized = Omit<
  UserProfile,
  "marketsOfInterest" | "otherMarkets" | "conceptFamiliarity"
> & {
  marketsOfInterest: string[] | null;
  otherMarkets: string[] | null;
  conceptFamiliarity: string[] | null;
};

function serialize(row: UserProfile): Serialized {
  return {
    ...row,
    marketsOfInterest: row.marketsOfInterest ? JSON.parse(row.marketsOfInterest) : null,
    otherMarkets: row.otherMarkets ? JSON.parse(row.otherMarkets) : null,
    conceptFamiliarity: row.conceptFamiliarity ? JSON.parse(row.conceptFamiliarity) : null,
  };
}

// The profile is per-user; the organization is a second predicate on every read
// and write, never a replacement for the user filter. A row whose org no longer
// matches the caller's membership is unreachable rather than silently readable,
// and the INSERT below then fails loudly on `user_profile.user_id`'s unique
// index — the same stance the middleware takes on a missing membership.
async function ensureRow(userId: string, organizationId: string): Promise<UserProfile> {
  const existing = await db.query.userProfile.findFirst({
    where: and(eq(userProfile.userId, userId), eq(userProfile.organizationId, organizationId)),
  });
  if (existing) return existing;

  await db.insert(userProfile).values({ userId, organizationId });
  const created = await db.query.userProfile.findFirst({
    where: and(eq(userProfile.userId, userId), eq(userProfile.organizationId, organizationId)),
  });
  return created!;
}

// GET /api/onboarding — auto-creates a row on first call
app.get("/", async (c) => {
  const user = c.get("user");
  const row = await ensureRow(user.id, c.get("organizationId"));
  return c.json(serialize(row));
});

const step1Schema = z.object({
  countryCode: z.string().length(2),
  currency: z.string().length(3),
});

const step2Schema = z.object({
  experience: z.enum(EXPERIENCE),
  horizon: z.enum(HORIZON),
  riskBehavior: z.enum(RISK_BEHAVIOR),
  goal: z.enum(GOAL),
});

const step3Schema = z
  .object({
    marketsOfInterest: z.array(z.enum(MARKETS)),
    otherMarkets: z.array(z.string().trim().min(1).max(64)).max(10).default([]),
    conceptFamiliarity: z.array(z.enum(CONCEPTS)),
  })
  .refine((v) => v.marketsOfInterest.length + v.otherMarkets.length >= 1, {
    message: "Pick at least one market",
    path: ["marketsOfInterest"],
  });

async function patchStep(
  userId: string,
  organizationId: string,
  step: 1 | 2 | 3,
  patch: Partial<typeof userProfile.$inferInsert>
) {
  const existing = await db.query.userProfile.findFirst({
    where: and(eq(userProfile.userId, userId), eq(userProfile.organizationId, organizationId)),
  });
  if (!existing) return null;

  const nextStep = Math.max(existing.currentStep, step + 1);
  await db
    .update(userProfile)
    .set({ ...patch, currentStep: nextStep, updatedAt: sql`(unixepoch())` })
    .where(and(eq(userProfile.userId, userId), eq(userProfile.organizationId, organizationId)));

  const updated = await db.query.userProfile.findFirst({
    where: and(eq(userProfile.userId, userId), eq(userProfile.organizationId, organizationId)),
  });
  return updated!;
}

app.patch("/step/1", zValidator("json", step1Schema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  const row = await patchStep(user.id, c.get("organizationId"), 1, {
    countryCode: body.countryCode,
    currency: body.currency,
  });
  if (!row) return c.json({ error: "Profile not initialized" }, 404);
  return c.json(serialize(row));
});

app.patch("/step/2", zValidator("json", step2Schema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  const row = await patchStep(user.id, c.get("organizationId"), 2, {
    experience: body.experience,
    horizon: body.horizon,
    riskBehavior: body.riskBehavior,
    riskTolerance: deriveRiskTolerance(body.riskBehavior),
    goal: body.goal,
  });
  if (!row) return c.json({ error: "Profile not initialized" }, 404);
  return c.json(serialize(row));
});

app.patch("/step/3", zValidator("json", step3Schema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  const row = await patchStep(user.id, c.get("organizationId"), 3, {
    marketsOfInterest: JSON.stringify(body.marketsOfInterest),
    otherMarkets: JSON.stringify(body.otherMarkets),
    conceptFamiliarity: JSON.stringify(body.conceptFamiliarity),
  });
  if (!row) return c.json({ error: "Profile not initialized" }, 404);
  return c.json(serialize(row));
});

// The grant lands on the organization's wallet now, so it is paid once per seat
// out of the balance the tenant is invoiced for. Whitelabel tenants switch it
// off by setting `signup_grant_credits` to 0; the module constant only covers an
// org with no settings row.
async function resolveSignupGrant(organizationId: string): Promise<number> {
  const settings = await db.query.organizationSettings.findFirst({
    where: eq(organizationSettings.organizationId, organizationId),
    columns: { signupGrantCredits: true },
  });
  return settings?.signupGrantCredits ?? SIGNUP_GRANT_CREDITS;
}

// POST /api/onboarding/complete — sets completedAt; rejects if any required field missing
app.post("/complete", async (c) => {
  const user = c.get("user");
  const organizationId = c.get("organizationId");
  const row = await db.query.userProfile.findFirst({
    where: and(eq(userProfile.userId, user.id), eq(userProfile.organizationId, organizationId)),
  });
  if (!row) return c.json({ error: "Profile not initialized" }, 404);

  const required = [
    row.countryCode,
    row.currency,
    row.experience,
    row.horizon,
    row.riskBehavior,
    row.goal,
  ];
  const markets = row.marketsOfInterest ? (JSON.parse(row.marketsOfInterest) as string[]) : [];
  const others = row.otherMarkets ? (JSON.parse(row.otherMarkets) as string[]) : [];
  if (required.some((v) => v == null || v === "") || markets.length + others.length === 0) {
    return c.json({ error: "Onboarding incomplete" }, 400);
  }

  await db
    .update(userProfile)
    .set({ completedAt: new Date(), updatedAt: sql`(unixepoch())` })
    .where(and(eq(userProfile.userId, user.id), eq(userProfile.organizationId, organizationId)));

  // Idempotent: re-completing onboarding won't re-grant credits. The key format
  // is this endpoint's ONLY re-grant guard — there is no already-completed
  // check — so it must not be namespaced or otherwise changed.
  const signupGrant = await resolveSignupGrant(organizationId);
  if (signupGrant > 0) {
    await grantCredits({
      organizationId,
      userId: user.id,
      credits: signupGrant,
      reason: "grant",
      idempotencyKey: `signup-grant:${user.id}`,
    });
  }

  const updated = await db.query.userProfile.findFirst({
    where: and(eq(userProfile.userId, user.id), eq(userProfile.organizationId, organizationId)),
  });
  return c.json(serialize(updated!));
});

export default app;
