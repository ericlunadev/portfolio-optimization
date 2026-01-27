import { serve } from "@hono/node-server";
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

const app = new Hono();

// Middleware
app.use("*", logger());
app.use("*", errorHandler);
app.use(
  "*",
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
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

// Start server
const port = 8000;
console.log(`Starting Portfolio Optimization API on port ${port}`);
console.log(`Frontend URL: ${env.FRONTEND_URL}`);
console.log(`API Docs: http://localhost:${port}/api/health`);

serve({
  fetch: app.fetch,
  port,
});

export default app;
