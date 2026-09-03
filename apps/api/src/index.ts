import { serve } from "@hono/node-server";
import app from "./app.js";
import { env } from "./config/env.js";
import { assertWalletLedgerInvariant } from "./lib/billing/reconcile.js";

// Server entry point. The app itself is composed in app.ts; this file owns only
// the module-scope side effects that must never run inside a test.

// Start server
const port = env.PORT;
console.log(`Starting Portfolio Optimization API on port ${port}`);
console.log(`Frontend URL: ${env.FRONTEND_URL}`);
console.log(`API Docs: http://localhost:${port}/api/health`);

serve({
  fetch: app.fetch,
  port,
});

if (process.env.NODE_ENV !== "production") {
  assertWalletLedgerInvariant().catch((err) => {
    console.error("[billing] reconcile check failed to run:", err);
  });
}

export default app;
