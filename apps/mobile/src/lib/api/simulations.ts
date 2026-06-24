import { api } from '@/lib/api/client';
import type { OptimizationResult, OptimizeRequest } from '@/lib/api/optimization';

/**
 * Mirrors the `/api/simulations/*` routes in `apps/api`. Every endpoint requires
 * an authenticated BetterAuth session; the session cookie is attached
 * automatically by the API client (`src/lib/api/client.ts`).
 *
 * A "simulation" is a saved optimizer run: the request we sent (`params`) plus
 * the result we got back (`result`). The mobile optimizer omits date ranges, so
 * re-running always recomputes against the latest available data.
 */

/** The request payload we sent for the run; enough to display and re-run it. */
export type SimulationParams = OptimizeRequest;

/** Full saved simulation, including the optimizer result. */
export type SavedSimulation = {
  id: string;
  name: string | null;
  params: SimulationParams;
  result: OptimizationResult;
  createdAt: string;
};

/** Lightweight row returned by the list endpoint (derived from params/result). */
export type SimulationListItem = {
  id: string;
  name: string | null;
  tickers: string[];
  strategy: OptimizeRequest['strategy'];
  expectedReturn: number;
  volatility: number;
  sharpeRatio: number;
  params: SimulationParams;
  pinned: boolean;
  createdAt: string;
};

export function listSimulations() {
  return api.get<SimulationListItem[]>('/api/simulations');
}

export function getSimulation(id: string) {
  return api.get<SavedSimulation>(`/api/simulations/${id}`);
}

export function saveSimulation(params: SimulationParams, result: OptimizationResult, name?: string) {
  return api.post<SavedSimulation>('/api/simulations', { params, result, name });
}

export function updateSimulationName(id: string, name: string | null) {
  return api.patch<{ id: string; name: string | null; pinned: boolean }>(`/api/simulations/${id}`, {
    name,
  });
}

export function updateSimulationPinned(id: string, pinned: boolean) {
  return api.patch<{ id: string; name: string | null; pinned: boolean }>(`/api/simulations/${id}`, {
    pinned,
  });
}

/** Replaces the stored params + result, used when re-running a saved run. */
export function updateSimulation(id: string, params: SimulationParams, result: OptimizationResult) {
  return api.put<SavedSimulation>(`/api/simulations/${id}`, { params, result });
}

export function deleteSimulation(id: string) {
  return api.del<{ success: boolean }>(`/api/simulations/${id}`);
}
