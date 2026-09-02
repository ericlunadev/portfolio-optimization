import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error.js";

// Import routes
import auth from "./modules/auth/routes.js";
import optimization from "./modules/optimization/routes.js";
import tasks from "./modules/tasks/routes.js";
import historical from "./modules/historical/routes.js";
import simulations from "./modules/simulations/routes.js";
import onboarding from "./modules/onboarding/routes.js";
import billing from "./modules/billing/routes.js";

// The composed app and nothing else. Starting the server and running the
// wallet/ledger reconcile check stay in index.ts, so importing this module from
// a test neither binds port 8001 nor fires a background query — the tenant
// isolation suite drives the real middleware stack through `app.fetch`.
const app = new Hono();

// Middleware
app.use("*", logger());
app.use("*", errorHandler);
app.use(
  "*",
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    // Idempotency-Key is sent by the web and mobile clients on billing writes;
    // leaving it out fails the preflight on those endpoints.
    allowHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
  })
);

// Health check
app.get("/api/health", (c) => {
  return c.json({ status: "healthy", version: "1.0.0" });
});

// Mount routes
app.route("/api/auth", auth);
app.route("/api/optimization", optimization);
app.route("/api/tasks", tasks);
app.route("/api/historical", historical);
app.route("/api/simulations", simulations);
app.route("/api/onboarding", onboarding);
app.route("/api/billing", billing);

export default app;
