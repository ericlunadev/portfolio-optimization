import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, or, desc, type SQL } from "drizzle-orm";
import { db } from "../../db/index.js";
import { simulations } from "../../db/schema.js";
import { authMiddleware } from "../../middleware/auth.js";
import { toISOStringOrNow } from "../../lib/dates.js";

const app = new Hono();

// All simulation routes require authentication and are scoped per organization
app.use("*", authMiddleware);

// Reads reach the caller's own simulations plus anything shared with the org.
function readScope(organizationId: string, userId: string): SQL | undefined {
  return and(
    eq(simulations.organizationId, organizationId),
    or(eq(simulations.userId, userId), eq(simulations.sharedWithOrg, true))
  );
}

// Writes reach the caller's own simulations only: sharing grants read, never write.
function writeScope(organizationId: string, userId: string): SQL | undefined {
  return and(
    eq(simulations.organizationId, organizationId),
    eq(simulations.userId, userId)
  );
}

// A write filtered by writeScope alone only learns that zero rows changed, which
// cannot separate "no such simulation" (404) from "shared with you, so read-only"
// (403). Every write handler therefore looks the row up with readScope first.
async function isReadable(
  id: string,
  organizationId: string,
  userId: string
): Promise<boolean> {
  const row = await db.query.simulations.findFirst({
    where: and(eq(simulations.id, id), readScope(organizationId, userId)),
    columns: { id: true },
  });
  return row !== undefined;
}

// GET /api/simulations - List the simulations visible to the current user
app.get("/", async (c) => {
  const user = c.get("user");
  const organizationId = c.get("organizationId");

  const rows = await db
    .select()
    .from(simulations)
    .where(readScope(organizationId, user.id))
    .orderBy(desc(simulations.pinned), desc(simulations.createdAt));

  const items = rows.map((row) => {
    const params = JSON.parse(row.params);
    const result = JSON.parse(row.result);
    return {
      id: row.id,
      name: row.name,
      tickers: params.tickers ?? [],
      strategy: params.strategy ?? "max-sharpe",
      expectedReturn: result.expected_return ?? 0,
      volatility: result.volatility ?? 0,
      sharpeRatio: result.sharpe_ratio ?? 0,
      params,
      pinned: row.pinned,
      sharedWithOrg: row.sharedWithOrg,
      // The list mixes the caller's rows with colleagues' shared ones, and only
      // the former accept a write. Without this the client renders edit and
      // delete affordances on rows the API answers with 403.
      isOwner: row.userId === user.id,
      createdAt: toISOStringOrNow(row.createdAt),
    };
  });

  return c.json(items);
});

// GET /api/simulations/:id - Get full simulation details
app.get("/:id", async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");
  const organizationId = c.get("organizationId");

  const row = await db.query.simulations.findFirst({
    where: and(eq(simulations.id, id), readScope(organizationId, user.id)),
  });

  if (!row) {
    return c.json({ error: "Simulation not found" }, 404);
  }

  return c.json({
    id: row.id,
    name: row.name,
    params: JSON.parse(row.params),
    result: JSON.parse(row.result),
    createdAt: toISOStringOrNow(row.createdAt),
  });
});

// POST /api/simulations - Save a new simulation
const createSchema = z.object({
  name: z.string().optional(),
  params: z.object({}).passthrough(),
  result: z.object({}).passthrough(),
});

app.post("/", zValidator("json", createSchema), async (c) => {
  const body = c.req.valid("json");

  const params = body.params as Record<string, unknown>;
  const result = body.result as Record<string, unknown>;

  const name = body.name?.trim() || null;

  const id = crypto.randomUUID();
  const user = c.get("user");
  const organizationId = c.get("organizationId");

  // `.returning()` instead of a re-read by id: it cannot drift from the row just
  // written, and it keeps every query in this file org-scoped.
  const [row] = await db
    .insert(simulations)
    .values({
      id,
      userId: user.id,
      organizationId,
      name,
      params: JSON.stringify(params),
      result: JSON.stringify(result),
    })
    .returning();

  return c.json(
    {
      id: row.id,
      name: row.name,
      params: JSON.parse(row.params),
      result: JSON.parse(row.result),
      createdAt: toISOStringOrNow(row.createdAt),
    },
    201
  );
});

// PATCH /api/simulations/:id - Update name and/or pinned state of a simulation
const patchSchema = z
  .object({
    name: z.string().max(200).nullable().optional(),
    pinned: z.boolean().optional(),
    // Sharing is itself a write, so it goes through writeScope like the rest: a
    // colleague can read a shared row but can never share or unshare it.
    sharedWithOrg: z.boolean().optional(),
  })
  .refine(
    (v) => v.name !== undefined || v.pinned !== undefined || v.sharedWithOrg !== undefined,
    { message: "name, pinned or sharedWithOrg required" }
  );

app.patch("/:id", zValidator("json", patchSchema), async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");
  const organizationId = c.get("organizationId");
  const body = c.req.valid("json");

  const updates: { name?: string | null; pinned?: boolean; sharedWithOrg?: boolean } = {};
  if (body.name !== undefined) updates.name = body.name?.trim() || null;
  if (body.pinned !== undefined) updates.pinned = body.pinned;
  if (body.sharedWithOrg !== undefined) updates.sharedWithOrg = body.sharedWithOrg;

  if (!(await isReadable(id, organizationId, user.id))) {
    return c.json({ error: "Simulation not found" }, 404);
  }

  const updated = await db
    .update(simulations)
    .set(updates)
    .where(and(eq(simulations.id, id), writeScope(organizationId, user.id)))
    .returning({
      id: simulations.id,
      name: simulations.name,
      pinned: simulations.pinned,
      sharedWithOrg: simulations.sharedWithOrg,
    });

  if (updated.length === 0) {
    return c.json({ error: "Simulation is read-only" }, 403);
  }

  return c.json(updated[0]);
});

// PUT /api/simulations/:id - Replace params + result on an existing simulation (used by re-run)
const putSchema = z.object({
  params: z.object({}).passthrough(),
  result: z.object({}).passthrough(),
});

app.put("/:id", zValidator("json", putSchema), async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");
  const organizationId = c.get("organizationId");
  const body = c.req.valid("json");

  const params = body.params as Record<string, unknown>;
  const result = body.result as Record<string, unknown>;

  if (!(await isReadable(id, organizationId, user.id))) {
    return c.json({ error: "Simulation not found" }, 404);
  }

  const updated = await db
    .update(simulations)
    .set({
      params: JSON.stringify(params),
      result: JSON.stringify(result),
    })
    .where(and(eq(simulations.id, id), writeScope(organizationId, user.id)))
    .returning();

  if (updated.length === 0) {
    return c.json({ error: "Simulation is read-only" }, 403);
  }

  const row = updated[0];

  return c.json({
    id: row.id,
    name: row.name,
    params: JSON.parse(row.params),
    result: JSON.parse(row.result),
    createdAt: toISOStringOrNow(row.createdAt),
  });
});

// DELETE /api/simulations/:id - Delete a simulation owned by the current user
app.delete("/:id", async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");
  const organizationId = c.get("organizationId");

  if (!(await isReadable(id, organizationId, user.id))) {
    return c.json({ error: "Simulation not found" }, 404);
  }

  const deleted = await db
    .delete(simulations)
    .where(and(eq(simulations.id, id), writeScope(organizationId, user.id)))
    .returning({ id: simulations.id });

  if (deleted.length === 0) {
    return c.json({ error: "Simulation is read-only" }, 403);
  }

  return c.json({ success: true });
});

export default app;
