import { Hono } from "hono";
import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "../../config/env.js";
import { runDueSchedules } from "../schedules/runner.js";

/**
 * Machine-to-machine endpoints. Deliberately not behind `authMiddleware`: the
 * caller is the Vercel cron function, authenticated by a shared secret.
 */
const internal = new Hono();

function hash(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Constant-time check of `Authorization: Bearer <INTERNAL_API_SECRET>`. */
export function isAuthorized(header: string | undefined, secret: string | undefined): boolean {
  if (!secret || !header?.startsWith("Bearer ")) return false;
  // Hashing first gives equal-length buffers, so the compare leaks neither the
  // secret nor its length.
  return timingSafeEqual(hash(header.slice("Bearer ".length)), hash(secret));
}

let running: Promise<unknown> | null = null;

// POST /api/internal/run-schedules - Run every due schedule, in the background
internal.post("/run-schedules", (c) => {
  if (!isAuthorized(c.req.header("Authorization"), env.INTERNAL_API_SECRET)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // A retry from the trigger while a batch is still going: the claim would make
  // a second batch a no-op anyway, this just skips the wasted queries.
  if (running) {
    return c.json({ accepted: true, alreadyRunning: true }, 202);
  }

  running = runDueSchedules()
    .catch((err) => console.error("[schedules] batch failed", err))
    .finally(() => {
      running = null;
    });

  return c.json({ accepted: true }, 202);
});

export default internal;
