import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import { auth } from "../lib/auth.js";
import type { User } from "../db/schema.js";

declare module "hono" {
  interface ContextVariableMap {
    user: User;
    optionalUser: User | null;
  }
}

async function getSessionUser(c: Context): Promise<User | null> {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session?.user) return null;

  return session.user as User;
}

export async function authMiddleware(c: Context, next: Next) {
  const user = await getSessionUser(c);

  if (!user) {
    throw new HTTPException(401, { message: "Authentication required" });
  }

  c.set("user", user);
  await next();
}

export async function optionalAuthMiddleware(c: Context, next: Next) {
  const user = await getSessionUser(c);
  c.set("optionalUser", user);
  await next();
}
