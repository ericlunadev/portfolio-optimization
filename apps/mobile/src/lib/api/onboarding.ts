import { api } from '@/lib/api/client';

/**
 * Mirrors the `/api/onboarding` routes in `apps/api`. The module auto-creates a
 * `user_profile` row on first GET, persists each wizard step via PATCH, and is
 * finalized with POST `/complete` (which sets `completedAt` and idempotently
 * grants the signup credits). Every endpoint requires an authenticated
 * BetterAuth session; the session cookie is attached automatically by the API
 * client (`src/lib/api/client.ts`).
 */

export type ExperienceLevel = 'none' | 'beginner' | 'intermediate' | 'advanced';
export type InvestmentHorizon = 'short' | 'medium' | 'long';
export type RiskBehavior = 'sell_all' | 'sell_some' | 'hold' | 'buy_more';
export type RiskTolerance = 'conservative' | 'moderate' | 'aggressive';
export type InvestmentGoal = 'retirement' | 'growth' | 'preservation' | 'specific';
export type MarketCode = 'MX' | 'US' | 'EU' | 'LATAM' | 'AR' | 'CRYPTO';
export type ConceptKey = 'markowitz' | 'sharpe' | 'volatility' | 'beta' | 'frontier';

/** Serialized `user_profile` row. `completedAt == null` means onboarding is unfinished. */
export type UserProfile = {
  id: number;
  userId: string;
  countryCode: string | null;
  currency: string | null;
  experience: ExperienceLevel | null;
  horizon: InvestmentHorizon | null;
  riskBehavior: RiskBehavior | null;
  riskTolerance: RiskTolerance | null;
  goal: InvestmentGoal | null;
  marketsOfInterest: MarketCode[] | null;
  otherMarkets: string[] | null;
  conceptFamiliarity: ConceptKey[] | null;
  currentStep: number;
  completedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

/** Per-step PATCH bodies, keyed positionally to steps 1, 2 and 3. */
export type OnboardingStepPayload =
  | { countryCode: string; currency: string }
  | {
      experience: ExperienceLevel;
      horizon: InvestmentHorizon;
      riskBehavior: RiskBehavior;
      goal: InvestmentGoal;
    }
  | {
      marketsOfInterest: MarketCode[];
      otherMarkets: string[];
      conceptFamiliarity: ConceptKey[];
    };

/** GET /api/onboarding — auto-creates the profile row on first call. */
export function getOnboarding() {
  return api.get<UserProfile>('/api/onboarding');
}

/** PATCH /api/onboarding/step/{1|2|3} — persists one step, advancing `currentStep`. */
export function patchOnboardingStep(step: 1 | 2 | 3, data: OnboardingStepPayload) {
  return api.patch<UserProfile>(`/api/onboarding/step/${step}`, data);
}

/** POST /api/onboarding/complete — finalizes and grants the signup credits. */
export function completeOnboarding() {
  return api.post<UserProfile>('/api/onboarding/complete');
}
