import Stripe from "stripe";
import { env } from "../../config/env.js";

let cached: Stripe | null = null;

// Lazily-instantiated client. Returns null if STRIPE_SECRET_KEY isn't set —
// callers should treat that as "Stripe is disabled" rather than a fatal error.
export function getStripe(): Stripe | null {
  if (!env.STRIPE_SECRET_KEY) return null;
  if (!cached) {
    cached = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-04-22.dahlia",
      typescript: true,
    });
  }
  return cached;
}

export function getWebhookSecret(): string | null {
  return env.STRIPE_WEBHOOK_SECRET ?? null;
}
