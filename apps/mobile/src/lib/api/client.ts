/**
 * Thin typed wrapper around `fetch` for talking to the Portfolio Optimization
 * API (`apps/api`). Keep transport concerns (base URL, headers, error shaping)
 * here so feature-level API modules stay declarative.
 */
import { authClient } from '@/lib/auth-client';
import { Env } from '@/lib/env';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & {
  /** JSON-serializable request body. */
  body?: unknown;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options;

  // React Native's fetch does not persist cookies, so the BetterAuth Expo
  // client stores the session token (in SecureStore) and exposes it here. We
  // forward it as the `Cookie` header for the API's session middleware.
  const sessionCookie = authClient.getCookie();

  const response = await fetch(`${Env.apiUrl}${path}`, {
    ...rest,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(sessionCookie ? { Cookie: sessionCookie } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'omit',
  });

  if (!response.ok) {
    throw new ApiError(`Request to ${path} failed`, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),
};
