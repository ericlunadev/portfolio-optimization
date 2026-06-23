/**
 * BetterAuth client for the mobile app.
 *
 * Mirrors the web app's `auth-client.ts` but uses the `@better-auth/expo`
 * plugin so OAuth runs through the system browser and redirects back into the
 * app via the `portfoliooptimization://` deep-link scheme. The session token is
 * persisted with `expo-secure-store` and replayed on API requests through
 * `authClient.getCookie()` (see `src/lib/api/client.ts`) — React Native does not
 * manage cookies automatically like a browser does.
 */
import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import * as SecureStore from 'expo-secure-store';

import { Env } from '@/lib/env';

/** Deep-link scheme, kept in sync with `scheme` in `app.json`. */
const APP_SCHEME = 'portfoliooptimization';

export const authClient = createAuthClient({
  baseURL: Env.apiUrl,
  plugins: [
    expoClient({
      scheme: APP_SCHEME,
      storagePrefix: APP_SCHEME,
      storage: SecureStore,
    }),
  ],
});

export const { signIn, signOut, useSession } = authClient;

/** Social providers wired on the API (`apps/api/src/lib/auth.ts`). */
export type SocialProvider = 'google' | 'github' | 'microsoft';
