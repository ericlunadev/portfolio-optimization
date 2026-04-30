import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/index.js";
import { env } from "../config/env.js";
import * as schema from "../db/schema.js";
import { sendEmail } from "./email/send.js";
import { emailMessages } from "./email/i18n.js";
import { getLocaleFromRequest } from "./email/locale.js";
import { VerifyEmail } from "./email/templates/VerifyEmail.js";
import { ResetPassword } from "./email/templates/ResetPassword.js";

const isProduction = env.BACKEND_URL.startsWith("https://");

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema,
  }),
  baseURL: env.BACKEND_URL,
  basePath: "/api/auth",
  secret: env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, token }, request) => {
      const locale = getLocaleFromRequest(request);
      const url = `${env.FRONTEND_URL}/auth/reset-password?token=${encodeURIComponent(token)}`;
      await sendEmail({
        to: user.email,
        subject: emailMessages[locale].resetSubject,
        react: ResetPassword({ url, locale, userName: user.name }),
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, token }, request) => {
      const locale = getLocaleFromRequest(request);
      const url = `${env.FRONTEND_URL}/auth/verify-email?token=${encodeURIComponent(token)}`;
      await sendEmail({
        to: user.email,
        subject: emailMessages[locale].verifySubject,
        react: VerifyEmail({ url, locale, userName: user.name }),
      });
    },
  },
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
