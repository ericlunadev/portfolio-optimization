import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/index.js";
import { env } from "../config/env.js";
import * as schema from "../db/schema.js";

const isProduction = env.BACKEND_URL.startsWith("https://");

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema,
  }),
  baseURL: env.BACKEND_URL,
  basePath: "/api/auth",
  secret: env.BETTER_AUTH_SECRET,
  socialProviders: {
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
    ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
      ? {
          github: {
            clientId: env.GITHUB_CLIENT_ID,
            clientSecret: env.GITHUB_CLIENT_SECRET,
          },
        }
      : {}),
    ...(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET
      ? {
          microsoft: {
            clientId: env.MICROSOFT_CLIENT_ID,
            clientSecret: env.MICROSOFT_CLIENT_SECRET,
          },
        }
      : {}),
  },
  trustedOrigins: [env.FRONTEND_URL],
  advanced: {
    defaultCookieAttributes: isProduction
      ? {
          // Cross-origin cookies for production (frontend + API on different domains)
          sameSite: "none",
          secure: true,
          partitioned: true,
        }
      : {
          sameSite: "lax",
          secure: false,
        },
  },
});

export type Auth = typeof auth;
