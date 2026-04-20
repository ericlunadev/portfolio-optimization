import { Hono } from "hono";
import { auth } from "../../lib/auth.js";

const authApp = new Hono();

// Mount BetterAuth handler - it handles all /api/auth/* routes
authApp.on(["POST", "GET"], "/*", (c) => {
  return auth.handler(c.req.raw);
});

export default authApp;
