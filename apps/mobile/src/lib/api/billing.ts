import { api } from '@/lib/api/client';

/**
 * Mirrors the `/api/billing/*` routes in `apps/api`. Every endpoint requires an
 * authenticated BetterAuth session; the session cookie is attached
 * automatically by the API client (`src/lib/api/client.ts`).
 *
 * The optimize endpoint charges 1 credit per run (`meterRequest`) and returns
 * HTTP 402 (`INSUFFICIENT_CREDITS`) when the wallet is empty, so the mobile app
 * needs a way to read the balance and buy more — that's what this module backs.
 */

/** A payment rail offered for buying credits. */
export type BillingRail = 'stripe' | 'coinbase_commerce';

export type Wallet = {
  credits: number;
  updatedAt: string | null;
};

export type CreditPackage = {
  id: string;
  credits: number;
  /** Price in minor units (cents). */
  priceMinor: number;
  currency: string;
  rail: BillingRail;
};

/** A single credit movement (purchase, spend, grant, or reversal). */
export type LedgerEntry = {
  id: string;
  delta: number;
  reason: 'purchase' | 'spend' | 'grant' | 'reversal';
  balanceAfter: number;
  paymentId: string | null;
  simulationId: string | null;
  createdAt: string;
};

export type LedgerPage = {
  items: LedgerEntry[];
  nextCursor: number | null;
};

export type CheckoutSession = {
  /** Hosted checkout URL (Stripe or Coinbase Commerce). */
  url: string;
};

export type AdvisorCall = {
  bookingUrl: string;
  costCredits: number;
};

export function getWallet() {
  return api.get<Wallet>('/api/billing/wallet');
}

export function getPackages(rail?: BillingRail) {
  const path = rail ? `/api/billing/packages?rail=${rail}` : '/api/billing/packages';
  return api.get<CreditPackage[]>(path);
}

export function createCheckout(packageId: string) {
  return api.post<CheckoutSession>('/api/billing/checkout', { packageId });
}

export function createCryptoCheckout(packageId: string) {
  return api.post<CheckoutSession>('/api/billing/crypto/checkout', { packageId });
}

/** Starts a checkout on the given rail and returns the hosted payment URL. */
export function createCheckoutForRail(rail: BillingRail, packageId: string) {
  return rail === 'coinbase_commerce'
    ? createCryptoCheckout(packageId)
    : createCheckout(packageId);
}

export function getLedger(cursor?: number, limit = 50) {
  const params = new URLSearchParams();
  if (cursor !== undefined) params.set('cursor', String(cursor));
  params.set('limit', String(limit));
  return api.get<LedgerPage>(`/api/billing/ledger?${params.toString()}`);
}

/**
 * Books the advisor call, spending credits server-side. The idempotency key
 * guards against a double charge if the request is retried; pass a stable value
 * per intended booking. Throws `ApiError` with status 402 when the wallet can't
 * cover the cost.
 */
export function bookAdvisorCall(idempotencyKey: string) {
  return api.post<AdvisorCall>('/api/billing/advisor-call', undefined, {
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}
