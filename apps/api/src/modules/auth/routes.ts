import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { eq, and } from "drizzle-orm";
import { db } from "../../db/index.js";
import { users, refreshTokens } from "../../db/schema.js";
import { authMiddleware } from "../../middleware/auth.js";
import { createAccessToken, generateRefreshToken, hashToken } from "../../lib/jwt.js";
import { env } from "../../config/env.js";
import { getOAuthClient, getAuthorizationUrl, handleCallback, type OAuthProvider } from "./oauth.js";

const auth = new Hono();

const providerSchema = z.object({
  provider: z.enum(["google", "github", "microsoft"]),
});

// GET /api/auth/providers - List available OAuth providers
auth.get("/providers", (c) => {
  const providers: { name: string; enabled: boolean }[] = [];

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    providers.push({ name: "google", enabled: true });
  }
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    providers.push({ name: "github", enabled: true });
  }
  if (env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET) {
    providers.push({ name: "microsoft", enabled: true });
  }

  return c.json({ providers });
});

// GET /api/auth/login/:provider - Initiate OAuth flow
auth.get("/login/:provider", zValidator("param", providerSchema), async (c) => {
  const { provider } = c.req.valid("param");

  const client = getOAuthClient(provider);
  if (!client) {
    throw new HTTPException(400, { message: `Provider ${provider} not configured` });
  }

  const state = crypto.randomUUID();
  const url = await getAuthorizationUrl(provider, state);

  // Store state in cookie for CSRF protection
  setCookie(c, "oauth_state", state, {
    httpOnly: true,
    secure: env.BACKEND_URL.startsWith("https"),
    sameSite: "Lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });

  return c.json({ url });
});

// GET /api/auth/callback/:provider - Handle OAuth callback
auth.get("/callback/:provider", zValidator("param", providerSchema), async (c) => {
  const { provider } = c.req.valid("param");
  const code = c.req.query("code");
  const state = c.req.query("state");
  const storedState = getCookie(c, "oauth_state");

  if (!code) {
    throw new HTTPException(400, { message: "Missing authorization code" });
  }

  if (!state || state !== storedState) {
    throw new HTTPException(400, { message: "Invalid state parameter" });
  }

  // Clear the state cookie
  deleteCookie(c, "oauth_state");

  const userInfo = await handleCallback(provider, code);
  if (!userInfo) {
    throw new HTTPException(400, { message: "Failed to get user info from provider" });
  }

  // Find or create user
  let user = await db.query.users.findFirst({
    where: and(eq(users.provider, provider), eq(users.providerId, userInfo.providerId)),
  });

  if (user) {
    // Update existing user
    await db
      .update(users)
      .set({
        email: userInfo.email,
        name: userInfo.name,
        pictureUrl: userInfo.pictureUrl,
        lastLogin: new Date(),
      })
      .where(eq(users.id, user.id));
  } else {
    // Create new user
    const result = await db
      .insert(users)
      .values({
        email: userInfo.email,
        name: userInfo.name,
        pictureUrl: userInfo.pictureUrl,
        provider,
        providerId: userInfo.providerId,
        lastLogin: new Date(),
      })
      .returning();
    user = result[0];
  }

  // Generate tokens
  const accessToken = await createAccessToken(user.id, user.email);
  const refreshToken = generateRefreshToken();
  const refreshTokenHash = await hashToken(refreshToken);

  // Store refresh token
  const refreshExpiresAt = new Date();
  refreshExpiresAt.setDate(refreshExpiresAt.getDate() + env.REFRESH_TOKEN_EXPIRE_DAYS);

  await db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash: refreshTokenHash,
    expiresAt: refreshExpiresAt,
  });

  // Set cookies
  const isSecure = env.BACKEND_URL.startsWith("https");

  setCookie(c, "access_token", accessToken, {
    httpOnly: true,
    secure: isSecure,
    sameSite: "Lax",
    maxAge: env.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    path: "/",
  });

  setCookie(c, "refresh_token", refreshToken, {
    httpOnly: true,
    secure: isSecure,
    sameSite: "Lax",
    maxAge: env.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
    path: "/",
  });

  // Redirect to frontend
  return c.redirect(env.FRONTEND_URL);
});

// POST /api/auth/refresh - Refresh access token
auth.post("/refresh", async (c) => {
  const refreshToken = getCookie(c, "refresh_token");

  if (!refreshToken) {
    throw new HTTPException(401, { message: "No refresh token provided" });
  }

  const tokenHash = await hashToken(refreshToken);
  const storedToken = await db.query.refreshTokens.findFirst({
    where: eq(refreshTokens.tokenHash, tokenHash),
    with: { user: true },
  });

  if (!storedToken) {
    throw new HTTPException(401, { message: "Invalid refresh token" });
  }

  if (storedToken.expiresAt < new Date()) {
    // Delete expired token
    await db.delete(refreshTokens).where(eq(refreshTokens.id, storedToken.id));
    throw new HTTPException(401, { message: "Refresh token expired" });
  }

  // Get user
  const user = await db.query.users.findFirst({
    where: eq(users.id, storedToken.userId),
  });

  if (!user) {
    throw new HTTPException(401, { message: "User not found" });
  }

  // Generate new access token
  const accessToken = await createAccessToken(user.id, user.email);

  setCookie(c, "access_token", accessToken, {
    httpOnly: true,
    secure: env.BACKEND_URL.startsWith("https"),
    sameSite: "Lax",
    maxAge: env.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    path: "/",
  });

  return c.json({ message: "Token refreshed" });
});

// POST /api/auth/logout - Clear auth cookies
auth.post("/logout", (c) => {
  deleteCookie(c, "access_token", { path: "/" });
  deleteCookie(c, "refresh_token", { path: "/" });
  return c.json({ message: "Logged out" });
});

// GET /api/auth/me - Get current user info
auth.get("/me", authMiddleware, (c) => {
  const user = c.get("user");
  return c.json({
    id: user.id,
    email: user.email,
    name: user.name,
    picture_url: user.pictureUrl,
  });
});

export default auth;
