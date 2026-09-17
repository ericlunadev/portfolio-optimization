import { betterAuth } from "better-auth";
import { expo } from "@better-auth/expo";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "../db/index.js";
import { env, isProduction } from "../config/env.js";
import * as schema from "../db/schema.js";
import {
  organization,
  organizationBranding,
  organizationMember,
  organizationSettings,
} from "../db/schema.js";
import { sendEmail } from "./email/send.js";
import { emailMessages } from "./email/i18n.js";
import { getLocaleFromRequest } from "./email/locale.js";
import { resolveEmailTenant } from "./email/tenant.js";
import { VerifyEmail } from "./email/templates/VerifyEmail.js";
import { ResetPassword } from "./email/templates/ResetPassword.js";
import { resolveTenantOrigin } from "./trusted-origins.js";

const staticTrustedOrigins = [
  env.FRONTEND_URL,
  // Native app deep-link scheme for OAuth redirects.
  env.MOBILE_APP_SCHEME,
  // Expo Go / dev client tunnels used during local development.
  ...(isProduction ? [] : ["exp://", "exp://*", "exp://**"]),
];

// Gives a brand-new account the organization that `authMiddleware` needs: it
// resolves the tenant from `organization_member` and throws 500 when there is no
// row, so without this every request after signup would fail. Migration 0008
// covered everyone who existed at the backfill; this covers everyone since.
//
// Not a transaction, deliberately. Overlapping `db.transaction()` calls against
// libSQL fail instead of serialising (PLAN.md Task 0.0(b)); wrapping these four
// writes in one and running 12 concurrent signups returned `SQLITE_BUSY:
// database is locked` for 11 of them, and left an organization with no member
// behind. Each write is therefore standalone and idempotent — a partially
// provisioned account is completed by the next call rather than duplicated.
export async function provisionOrganizationForUser(newUser: {
  id: string;
  name: string;
  email: string;
}): Promise<string> {
  // Same derivation as migration 0008 step (3): the BetterAuth user id, never the
  // email local-part, which is usually an invalid DNS label. The id is a 32-char
  // alphanumeric, so the slug is unique by construction.
  const slug = `u-${newUser.id.toLowerCase()}`;

  await db
    .insert(organization)
    .values({
      id: randomUUID(),
      slug,
      name: newUser.name.trim() || newUser.email,
    })
    .onConflictDoNothing();

  // Read back rather than reuse the generated id: on a retry the row already
  // exists and carries the id the earlier attempt wrote.
  const org = await db.query.organization.findFirst({
    where: eq(organization.slug, slug),
    columns: { id: true },
  });
  if (!org) {
    throw new Error(`organization ${slug} missing immediately after insert`);
  }

  await db
    .insert(organizationMember)
    .values({
      id: randomUUID(),
      organizationId: org.id,
      userId: newUser.id,
      role: "owner",
    })
    .onConflictDoNothing();

  // Today's D2C behaviour, matching migration 0008 step (5) — not the schema.ts
  // column defaults, which are the whitelabel defaults ('off', no crypto rail)
  // and would silently drop the advisor CTA and the crypto tab for a new signup.
  await db
    .insert(organizationSettings)
    .values({
      organizationId: org.id,
      advisorMode: "platform",
      cryptoRailEnabled: true,
      signupGrantCredits: 3,
    })
    .onConflictDoNothing();

  // Today's brand values, matching migration 0008 step (6). supportEmail,
  // privacyPolicyUrl and termsUrl stay NULL: no value for any of them exists in
  // the repo yet (PLAN.md §0.2 item 3).
  await db
    .insert(organizationBranding)
    .values({
      organizationId: org.id,
      productName: "Optimización de Portafolio",
      productShortName: "Optim.",
      tagline: "Optimización de portafolio basada en la teoría de Markowitz",
      accentHex: "#d7a042",
      fontKey: "instrument-sans",
    })
    .onConflictDoNothing();

  // No organization_domain row: a personal organization has no hostname of its
  // own and reaches the app through the default tenant (PLAN.md §3.1).

  return org.id;
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema,
  }),
  baseURL: env.BACKEND_URL,
  basePath: "/api/auth",
  secret: env.BETTER_AUTH_SECRET,
  // The Expo plugin lets the React Native app (apps/mobile) drive OAuth and
  // session handling via the app's deep-link scheme instead of browser cookies.
  plugins: [expo()],
  databaseHooks: {
    user: {
      create: {
        // Runs after the `user` row is committed — better-auth queues create.after
        // hooks until the surrounding adapter transaction (if any) has finished —
        // so the foreign key on organization_member.user_id already resolves.
        after: async (createdUser) => {
          try {
            await provisionOrganizationForUser(createdUser);
          } catch (err) {
            // Rethrow: the account exists but has no tenant, so every
            // authenticated request would 500 anyway (middleware/auth.ts).
            // Failing the signup itself is the loud version of the same fact.
            console.error(
              `[auth] failed to provision an organization for user ${createdUser.id}`,
              err
            );
            throw err;
          }
        },
      },
    },
  },
  // Both emails link to the tenant host the request came from, and carry that
  // tenant's name (lib/email/tenant.ts). BetterAuth 1.6 hands both callbacks the
  // incoming request when they run over HTTP — request-password-reset, sign-up,
  // send-verification-email, change-email, and the change-email step of
  // verify-email. Its OAuth callback passes one too, but that is the provider's
  // redirect, whose Referer is no tenant. That, a direct `auth.api` call (no
  // request at all) and the Expo app (its scheme is not a web origin) all get
  // FRONTEND_URL, as before.
  emailAndPassword: {
    enabled: true,
    // The body's `redirectTo` is not read: it is client-supplied, and BetterAuth
    // vets it against `trustedOrigins` only when there is a request. The web
    // client sends `${location.origin}/auth/reset-password`, which is what this
    // builds from the validated origin anyway.
    sendResetPassword: async ({ user, token }, request) => {
      const locale = getLocaleFromRequest(request);
      const tenant = await resolveEmailTenant(request);
      const url = `${tenant.baseUrl}/auth/reset-password?token=${encodeURIComponent(token)}`;
      await sendEmail({
        to: user.email,
        subject: emailMessages[locale].resetSubject,
        react: ResetPassword({ url, locale, userName: user.name, productName: tenant.productName }),
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    // Signs the user in wherever the link lands, which is why the link has to
    // land on their tenant's host and not on FRONTEND_URL.
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, token }, request) => {
      const locale = getLocaleFromRequest(request);
      const tenant = await resolveEmailTenant(request);
      const url = `${tenant.baseUrl}/auth/verify-email?token=${encodeURIComponent(token)}`;
      await sendEmail({
        to: user.email,
        subject: emailMessages[locale].verifySubject,
        react: VerifyEmail({ url, locale, userName: user.name, productName: tenant.productName }),
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
  // A function, so a tenant provisioned at runtime is trusted without a redeploy
  // (lib/trusted-origins.ts). BetterAuth 1.6 calls it with the incoming request
  // when the handler builds its context — that list also vets callbackURL and
  // redirectTo, so a tenant URL there is accepted only from that same tenant —
  // and again in the origin check every non-GET endpoint runs, sign-up, sign-in
  // and sign-out included. It reads the header that check compares: Origin, else
  // Referer. At startup it is called with no request and returns the fixed list.
  trustedOrigins: async (request) => {
    const claimed = request?.headers.get("origin") || request?.headers.get("referer");
    const tenantOrigin = claimed ? await resolveTenantOrigin(claimed) : null;
    return tenantOrigin ? [...staticTrustedOrigins, tenantOrigin] : staticTrustedOrigins;
  },
  advanced: {
    // Already the default everywhere except NODE_ENV=test, where BetterAuth 1.6
    // switches its origin and CSRF checks off. Pinned so the test suite runs the
    // gate production runs instead of passing every origin.
    disableOriginCheck: false,
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
