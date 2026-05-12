import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../../config/env.js";

const API_BASE = "https://api.commerce.coinbase.com";
const API_VERSION = "2018-03-22";

export type CoinbaseCharge = {
  id: string;
  code: string;
  hosted_url: string;
  pricing_type: string;
  pricing: {
    local: { amount: string; currency: string };
  };
  metadata?: Record<string, unknown>;
  timeline: Array<{ time: string; status: string }>;
};

export type CoinbaseEventType =
  | "charge:created"
  | "charge:confirmed"
  | "charge:failed"
  | "charge:delayed"
  | "charge:pending"
  | "charge:resolved";

export type CoinbaseEvent = {
  id: string;
  type: CoinbaseEventType | string;
  api_version: string;
  created_at: string;
  data: CoinbaseCharge;
};

export type CoinbaseWebhookEnvelope = {
  attempt_number: number;
  event: CoinbaseEvent;
};

export function isCoinbaseConfigured(): boolean {
  return Boolean(env.COINBASE_COMMERCE_API_KEY);
}

function getApiKey(): string {
  if (!env.COINBASE_COMMERCE_API_KEY) {
    throw new Error("COINBASE_COMMERCE_API_KEY is not configured");
  }
  return env.COINBASE_COMMERCE_API_KEY;
}

export function getWebhookSecret(): string | null {
  return env.COINBASE_COMMERCE_WEBHOOK_SECRET ?? null;
}

export async function createCharge(opts: {
  name: string;
  description: string;
  amountUsd: string; // decimal string, e.g. "5.00"
  metadata: Record<string, string>;
  redirectUrl?: string;
  cancelUrl?: string;
}): Promise<CoinbaseCharge> {
  const res = await fetch(`${API_BASE}/charges`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CC-Api-Key": getApiKey(),
      "X-CC-Version": API_VERSION,
    },
    body: JSON.stringify({
      name: opts.name,
      description: opts.description,
      pricing_type: "fixed_price",
      local_price: { amount: opts.amountUsd, currency: "USD" },
      metadata: opts.metadata,
      redirect_url: opts.redirectUrl,
      cancel_url: opts.cancelUrl,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Coinbase charge creation failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as { data: CoinbaseCharge };
  return json.data;
}

// Verifies the X-CC-Webhook-Signature header against the raw request body.
// Coinbase signs the body with HMAC-SHA256 using the shared webhook secret;
// the header is hex-encoded.
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null | undefined
): boolean {
  const secret = getWebhookSecret();
  if (!secret || !signatureHeader) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");

  let received: Buffer;
  let computed: Buffer;
  try {
    received = Buffer.from(signatureHeader, "hex");
    computed = Buffer.from(expected, "hex");
  } catch {
    return false;
  }

  if (received.length !== computed.length) return false;
  return timingSafeEqual(received, computed);
}
