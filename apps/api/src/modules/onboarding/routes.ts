import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { userProfile, type UserProfile } from "../../db/schema.js";
import { authMiddleware } from "../../middleware/auth.js";

const app = new Hono();

app.use("*", authMiddleware);

const EXPERIENCE = ["none", "beginner", "intermediate", "advanced"] as const;
const HORIZON = ["short", "medium", "long"] as const;
const RISK_BEHAVIOR = ["sell_all", "sell_some", "hold", "buy_more"] as const;
const GOAL = ["retirement", "growth", "preservation", "specific"] as const;
const MARKETS = ["MX", "US", "EU", "LATAM", "CRYPTO"] as const;
const CONCEPTS = ["markowitz", "sharpe", "volatility", "beta", "frontier"] as const;

function deriveRiskTolerance(behavior: (typeof RISK_BEHAVIOR)[number]): string {
  if (behavior === "sell_all") return "conservative";
  if (behavior === "buy_more") return "aggressive";
  return "moderate";
}

type Serialized = Omit<UserProfile, "marketsOfInterest" | "conceptFamiliarity"> & {
  marketsOfInterest: string[] | null;
  conceptFamiliarity: string[] | null;
};

function serialize(row: UserProfile): Serialized {
  return {
    ...row,
    marketsOfInterest: row.marketsOfInterest ? JSON.parse(row.marketsOfInterest) : null,
    conceptFamiliarity: row.conceptFamiliarity ? JSON.parse(row.conceptFamiliarity) : null,
  };
}

async function ensureRow(userId: string): Promise<UserProfile> {
  const existing = await db.query.userProfile.findFirst({
    where: eq(userProfile.userId, userId),
  });
  if (existing) return existing;

  await db.insert(userProfile).values({ userId });
  const created = await db.query.userProfile.findFirst({
    where: eq(userProfile.userId, userId),
  });
  return created!;
}

// GET /api/onboarding — auto-creates a row on first call
app.get("/", async (c) => {
  const user = c.get("user");
  const row = await ensureRow(user.id);
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

const step3Schema = z.object({
  marketsOfInterest: z.array(z.enum(MARKETS)).min(1),
  conceptFamiliarity: z.array(z.enum(CONCEPTS)),
});

async function patchStep(
  userId: string,
  step: 1 | 2 | 3,
  patch: Partial<typeof userProfile.$inferInsert>
) {
  const existing = await db.query.userProfile.findFirst({
    where: eq(userProfile.userId, userId),
  });
  if (!existing) return null;

  const nextStep = Math.max(existing.currentStep, step + 1);
  await db
    .update(userProfile)
    .set({ ...patch, currentStep: nextStep, updatedAt: sql`(unixepoch())` })
    .where(eq(userProfile.userId, userId));

  const updated = await db.query.userProfile.findFirst({
    where: eq(userProfile.userId, userId),
  });
  return updated!;
}

app.patch("/step/1", zValidator("json", step1Schema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  const row = await patchStep(user.id, 1, {
    countryCode: body.countryCode,
    currency: body.currency,
  });
  if (!row) return c.json({ error: "Profile not initialized" }, 404);
  return c.json(serialize(row));
});

app.patch("/step/2", zValidator("json", step2Schema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  const row = await patchStep(user.id, 2, {
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
  const row = await patchStep(user.id, 3, {
    marketsOfInterest: JSON.stringify(body.marketsOfInterest),
    conceptFamiliarity: JSON.stringify(body.conceptFamiliarity),
  });
  if (!row) return c.json({ error: "Profile not initialized" }, 404);
  return c.json(serialize(row));
});

// POST /api/onboarding/complete — sets completedAt; rejects if any required field missing
app.post("/complete", async (c) => {
  const user = c.get("user");
  const row = await db.query.userProfile.findFirst({
    where: eq(userProfile.userId, user.id),
  });
  if (!row) return c.json({ error: "Profile not initialized" }, 404);

  const required = [
    row.countryCode,
    row.currency,
    row.experience,
    row.horizon,
    row.riskBehavior,
    row.goal,
    row.marketsOfInterest,
  ];
  if (required.some((v) => v == null || v === "")) {
    return c.json({ error: "Onboarding incomplete" }, 400);
  }

  await db
    .update(userProfile)
    .set({ completedAt: new Date(), updatedAt: sql`(unixepoch())` })
    .where(eq(userProfile.userId, user.id));

  const updated = await db.query.userProfile.findFirst({
    where: eq(userProfile.userId, user.id),
  });
  return c.json(serialize(updated!));
});

export default app;
