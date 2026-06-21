import { api } from '@/lib/api/client';

export type HealthStatus = {
  status: string;
  version: string;
};

/** Public, unauthenticated connectivity check against the API. */
export function getHealth() {
  return api.get<HealthStatus>('/api/health');
}
