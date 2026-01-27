import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";

export async function errorHandler(c: Context, next: Next) {
  try {
    await next();
  } catch (err) {
    if (err instanceof HTTPException) {
      return c.json({ error: err.message }, err.status);
    }

    console.error("Unhandled error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
}
