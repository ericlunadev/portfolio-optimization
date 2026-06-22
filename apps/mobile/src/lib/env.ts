/**
 * Centralized, typed access to public runtime configuration.
 *
 * Expo inlines any variable prefixed with `EXPO_PUBLIC_` into the JS bundle at
 * build time, so these values are safe for the client but must never hold
 * secrets. Configure them in `.env` (see `.env.example`).
 */

const DEFAULT_API_URL = 'http://localhost:8000';

export const Env = {
  /** Base URL of the Portfolio Optimization API (`apps/api`). */
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_URL,
} as const;
