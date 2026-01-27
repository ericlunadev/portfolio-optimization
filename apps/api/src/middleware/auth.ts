import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { verifyAccessToken } from "../lib/jwt.js";
import type { User } from "../db/schema.js";

declare module "hono" {
  interface ContextVariableMap {
    user: User;
    optionalUser: User | null;
  }
}

export async function authMiddleware(c: Context, next: Next) {
  const token = getToken(c);

  if (!token) {
    throw new HTTPException(401, { message: "Authentication required" });
  }

  const payload = await verifyAccessToken(token);
  if (!payload) {
    throw new HTTPException(401, { message: "Invalid or expired token" });
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, payload.sub),
  });

  if (!user) {
    throw new HTTPException(401, { message: "User not found" });
  }

  c.set("user", user);
  await next();
}

export async function optionalAuthMiddleware(c: Context, next: Next) {
  const token = getToken(c);

  if (token) {
    const payload = await verifyAccessToken(token);
    if (payload) {
      const user = await db.query.users.findFirst({
        where: eq(users.id, payload.sub),
      });
      c.set("optionalUser", user ?? null);
    } else {
      c.set("optionalUser", null);
    }
  } else {
    c.set("optionalUser", null);
  }

  await next();
}

function getToken(c: Context): string | null {
  // Check cookie first
  const cookieToken = getCookie(c, "access_token");
  if (cookieToken) return cookieToken;

  // Check Authorization header
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  return null;
}
