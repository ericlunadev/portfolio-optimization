// Fixtures for the tenant-isolation suite: seeded organizations, users and
// scoped rows, plus a way to drive the real composed app as one of those users.
//
// How authentication works here, and why. `auth.api.signUpEmail` is unusable
// unmodified — `lib/auth.ts` sets `sendOnSignUp: true` and `lib/email/client.ts`
// throws without RESEND_API_KEY — so `asUser` stubs `auth.api.getSession` on the
// imported `auth` object instead. That is the smallest possible cut: it replaces
// only the cookie-to-user step. The `organization_member` lookup in
// `middleware/auth.ts`, and every org predicate in every route, stay on the real
// code path, which is exactly what these tests exist to exercise.
//
// The stub keys off `Authorization: Bearer <token>` rather than a cookie, so no
// signed-cookie machinery is involved. There is deliberately no row in the
// `session` table: it would authenticate nothing (the stub is what resolves the
// caller) and would only suggest that removing the stub still works.
//
// Importing this module loads `app.ts`, and through it `db/index.ts`. That is
// safe only because `src/test/setup.ts` has already pointed DATABASE_URL at the
// throwaway per-worker database — a test file must not import this module before
// setup has run, which vitest guarantees for `setupFiles`.

import { randomUUID } from "node:crypto";
import { vi } from "vitest";
import app from "../app.js";
import { db } from "../db/index.js";
import { auth } from "../lib/auth.js";
import {
  backgroundTasks,
  organization,
  organizationMember,
  organizationSettings,
  simulations,
  user,
  userProfile,
  type BackgroundTask,
  type NewUserProfile,
  type Simulation,
  type User,
  type UserProfile,
} from "../db/schema.js";

// Any absolute origin works: `app.fetch` needs a full URL and nothing in the app
// routes on the hostname yet (Phase 1's host-based tenant resolution lives in the
// web app, not here).
const ORIGIN = "http://api.test";

export type SeededOrg = {
  id: string;
  slug: string;
  name: string;
};

export type SeededUser = {
  id: string;
  name: string;
  email: string;
  /** The organization the membership row points at — what authMiddleware resolves. */
  organizationId: string;
  /** Sent as `Authorization: Bearer <token>` by `asUser`. */
  sessionToken: string;
};

export type TestRequestInit = Omit<RequestInit, "body"> & {
  body?: BodyInit | null;
  /** Serialized as a JSON body with the matching Content-Type. */
  json?: unknown;
};

export type TestFetch = (path: string, init?: TestRequestInit) => Promise<Response>;

// ==================== Sessions ====================

const sessionsByToken = new Map<string, User>();
let sessionStub: { mockRestore: () => void } | null = null;

function readHeader(headers: HeadersInit | undefined, name: string): string | null {
  if (!headers) return null;
  return new Headers(headers).get(name);
}

/**
 * Replaces `auth.api.getSession` with a lookup over the users seeded here.
 * Idempotent, and called for you by `seedUser` and `asUser`.
 */
export function installSessionStub(): void {
  // Asking the object rather than a local flag, so a suite-wide
  // `vi.restoreAllMocks()` reinstalls the stub instead of silently 401ing.
  if (vi.isMockFunction(auth.api.getSession)) return;

  sessionStub = vi
    .spyOn(auth.api, "getSession")
    .mockImplementation((async (options: { headers?: HeadersInit }) => {
      const bearer = readHeader(options?.headers, "authorization");
      const token = bearer?.replace(/^Bearer\s+/i, "");
      const seeded = token ? sessionsByToken.get(token) : undefined;

      // Null is what BetterAuth returns for an unknown or absent cookie, so an
      // unauthenticated request still gets the real 401 from authMiddleware.
      if (!seeded) return null;

      return {
        session: {
          id: `session-${seeded.id}`,
          token: token!,
          userId: seeded.id,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          createdAt: seeded.createdAt,
          updatedAt: seeded.updatedAt,
        },
        user: seeded,
      };
    }) as unknown as typeof auth.api.getSession);
}

/** Drops the stub and the seeded sessions. Only needed by a test that wants the real getSession back. */
export function restoreSessionStub(): void {
  sessionStub?.mockRestore();
  sessionStub = null;
  sessionsByToken.clear();
}

// ==================== Requests ====================

function buildRequest(path: string, init: TestRequestInit): Request {
  const { json, ...rest } = init;
  const headers = new Headers(rest.headers);

  let body = rest.body ?? null;
  if (json !== undefined) {
    body = JSON.stringify(json);
    headers.set("Content-Type", "application/json");
  }

  return new Request(new URL(path, ORIGIN), { ...rest, headers, body });
}

/** An authenticated `app.fetch` for one seeded user. */
export function asUser(seeded: SeededUser): TestFetch {
  installSessionStub();
  return async (path, init = {}) => {
    const request = buildRequest(path, init);
    request.headers.set("Authorization", `Bearer ${seeded.sessionToken}`);
    return app.fetch(request);
  };
}

/** The same thing with no session, for the routes that must reject one. */
export function asAnonymous(): TestFetch {
  installSessionStub();
  return async (path, init = {}) => app.fetch(buildRequest(path, init));
}

// ==================== Seeders ====================

/**
 * An organization and its `organization_settings` row.
 *
 * The settings row is not optional padding: `resolveSignupGrant`
 * (`modules/onboarding/routes.ts`) reads `signup_grant_credits` from it to decide
 * how many credits `POST /api/onboarding/complete` grants. Give two orgs
 * *different* values when a test needs that predicate to be load-bearing —
 * seeding neither, or both the same, makes the lookup's org filter invisible to
 * a mutation pass.
 *
 * Defaults are the D2C behaviour set that migration 0007 and the signup hook
 * both write, not the whitelabel column defaults in schema.ts.
 */
export async function seedOrg(
  overrides: Partial<SeededOrg> & {
    tier?: string;
    isDefault?: boolean;
    signupGrantCredits?: number;
    advisorMode?: string;
    cryptoRailEnabled?: boolean;
  } = {}
): Promise<SeededOrg> {
  const id = overrides.id ?? `org-${randomUUID()}`;
  const org: SeededOrg = {
    id,
    slug: overrides.slug ?? id,
    name: overrides.name ?? id,
  };

  await db.insert(organization).values({
    ...org,
    tier: overrides.tier ?? "cobranded",
    isDefault: overrides.isDefault ?? false,
  });

  await db.insert(organizationSettings).values({
    organizationId: id,
    advisorMode: overrides.advisorMode ?? "platform",
    cryptoRailEnabled: overrides.cryptoRailEnabled ?? true,
    signupGrantCredits: overrides.signupGrantCredits ?? 3,
  });

  return org;
}

/**
 * A user, plus the `organization_member` row that authMiddleware resolves the
 * tenant from. Creates the organization too when `organizationId` is omitted.
 *
 * `withMembership: false` seeds the user with no membership row — the state
 * authMiddleware deliberately answers with a 500 rather than inventing an org.
 */
export async function seedUser(
  options: {
    organizationId?: string;
    id?: string;
    name?: string;
    email?: string;
    role?: "owner" | "member";
    withMembership?: boolean;
  } = {}
): Promise<SeededUser> {
  const organizationId = options.organizationId ?? (await seedOrg()).id;
  const id = options.id ?? `user-${randomUUID()}`;
  const now = new Date();

  const [row] = await db
    .insert(user)
    .values({
      id,
      name: options.name ?? id,
      email: options.email ?? `${id}@example.com`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (options.withMembership !== false) {
    await db.insert(organizationMember).values({
      id: `member-${id}`,
      organizationId,
      userId: id,
      role: options.role ?? "owner",
    });
  }

  const sessionToken = `token-${randomUUID()}`;
  sessionsByToken.set(sessionToken, row);
  installSessionStub();

  return { id: row.id, name: row.name, email: row.email, organizationId, sessionToken };
}

export async function seedSimulation(options: {
  organizationId: string;
  userId: string | null;
  id?: string;
  name?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  pinned?: boolean;
  sharedWithOrg?: boolean;
}): Promise<Simulation> {
  const [row] = await db
    .insert(simulations)
    .values({
      id: options.id ?? randomUUID(),
      userId: options.userId,
      organizationId: options.organizationId,
      name: options.name ?? "Seeded simulation",
      params: JSON.stringify(options.params ?? { tickers: ["AAPL", "MSFT"], strategy: "max-sharpe" }),
      result: JSON.stringify(
        options.result ?? { expected_return: 0.1, volatility: 0.2, sharpe_ratio: 0.5, weights: {} }
      ),
      pinned: options.pinned ?? false,
      sharedWithOrg: options.sharedWithOrg ?? false,
    })
    .returning();

  return row;
}

/** `user_profile.user_id` is UNIQUE, so a user has at most one profile across all organizations. */
export async function seedProfile(
  options: { organizationId: string; userId: string } & Partial<NewUserProfile>
): Promise<UserProfile> {
  const { organizationId, userId, ...rest } = options;

  const [row] = await db
    .insert(userProfile)
    .values({
      userId,
      organizationId,
      countryCode: "MX",
      currency: "MXN",
      currentStep: 2,
      ...rest,
    })
    .returning();

  return row;
}

export async function seedTask(options: {
  organizationId: string;
  userId: string | null;
  id?: string;
  taskType?: string;
  status?: string;
  progress?: number;
  resultData?: Record<string, unknown>;
}): Promise<BackgroundTask> {
  const [row] = await db
    .insert(backgroundTasks)
    .values({
      id: options.id ?? randomUUID(),
      userId: options.userId,
      organizationId: options.organizationId,
      taskType: options.taskType ?? "yahoo_update",
      status: options.status ?? "completed",
      progress: options.progress ?? 100,
      resultData: JSON.stringify(options.resultData ?? { updated: 0 }),
    })
    .returning();

  return row;
}

export type MovedAnalyst = {
  /** Their session and membership: they belong to `user.organizationId` now. */
  user: SeededUser;
  /** Where the rows below are stamped — the organization they left. */
  previousOrganizationId: string;
  simulation: Simulation;
  task: BackgroundTask;
  profile: UserProfile;
};

/**
 * A user who owns rows stamped to an organization they are no longer in.
 *
 * Without this fixture a mutation pass reports the org predicate as dead code:
 * for every other fixture the owner predicate `user_id = ?` already excludes the
 * other tenant's rows, so deleting `organization_id = ?` breaks nothing and no
 * test fails. Here the owner predicate matches and only the org predicate keeps
 * the row out of reach.
 *
 * Note the profile: `user_profile.user_id` is UNIQUE, so this analyst has a
 * profile in the organization they left and none in their current one.
 */
export async function seedMovedAnalyst(
  options: { organizationId?: string; previousOrganizationId?: string } = {}
): Promise<MovedAnalyst> {
  const organizationId = options.organizationId ?? (await seedOrg()).id;
  const previousOrganizationId =
    options.previousOrganizationId ?? (await seedOrg()).id;

  const analyst = await seedUser({ organizationId });

  return {
    user: analyst,
    previousOrganizationId,
    simulation: await seedSimulation({
      organizationId: previousOrganizationId,
      userId: analyst.id,
      name: "Left behind",
    }),
    task: await seedTask({
      organizationId: previousOrganizationId,
      userId: analyst.id,
    }),
    profile: await seedProfile({
      organizationId: previousOrganizationId,
      userId: analyst.id,
    }),
  };
}
