import { Resend } from "resend";
import { env } from "../../config/env.js";

let cached: Resend | null = null;

export function getResendClient(): Resend {
  if (!env.RESEND_API_KEY) {
    throw new Error(
      "RESEND_API_KEY is not configured; cannot send transactional email."
    );
  }
  if (!cached) {
    cached = new Resend(env.RESEND_API_KEY);
  }
  return cached;
}
