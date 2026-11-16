import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  // Empty: /api/auth on this host, so the session cookie is per tenant (lib/api-base.ts).
  baseURL: "",
});
