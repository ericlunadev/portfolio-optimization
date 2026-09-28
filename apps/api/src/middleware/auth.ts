import { eq } from "drizzle-orm";
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/index.js";
import { auth } from "../lib/auth.js";
import { organizationMember } from "../db/schema.js";
import type { User } from "../db/schema.js";

declare module "hono" {
  interface ContextVariableMap {
    user: User;
    organizationId: string;
  }
}

async function getSessionUser(c: Context): Promise<User | null> {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session?.user) return null;

  return session.user as User;
}

// Resolved per request from the membership row — never from a client-supplied
// header, which is forgeable, and never cached on the session, which would go
// stale the moment a membership changes.
async function getOrganizationId(userId: string): Promise<string> {
  const membership = await db.query.organizationMember.findFirst({
    where: eq(organizationMember.userId, userId),
    columns: { organizationId: true },
  });

  if (!membership) {
    // Every account gets an organization at signup, and the backfill covered
    // everyone who existed before it. A miss is a data-integrity bug: fail
    // loudly instead of inventing an organization on a request path.
    console.error(
      `[auth] user ${userId} has no organization_member row — cannot resolve tenant`
    );
    throw new HTTPException(500, {
      message: "Organization context unavailable",
    });
  }

  return membership.organizationId;
}

export async function authMiddleware(c: Context, next: Next) {
  const user = await getSessionUser(c);

  if (!user) {
    throw new HTTPException(401, { message: "Authentication required" });
  }

  c.set("user", user);
  c.set("organizationId", await getOrganizationId(user.id));
  await next();
}
