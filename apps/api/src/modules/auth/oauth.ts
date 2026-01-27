import { Google, GitHub, MicrosoftEntraId } from "arctic";
import { env } from "../../config/env.js";

export type OAuthProvider = "google" | "github" | "microsoft";

export interface OAuthUserInfo {
  email: string;
  name: string | null;
  pictureUrl: string | null;
  providerId: string;
}

// Initialize OAuth clients lazily
let googleClient: Google | null = null;
let githubClient: GitHub | null = null;
let microsoftClient: MicrosoftEntraId | null = null;

function getGoogleClient(): Google | null {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;
  if (!googleClient) {
    googleClient = new Google(
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
      `${env.BACKEND_URL}/api/auth/callback/google`
    );
  }
  return googleClient;
}

function getGitHubClient(): GitHub | null {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) return null;
  if (!githubClient) {
    githubClient = new GitHub(
      env.GITHUB_CLIENT_ID,
      env.GITHUB_CLIENT_SECRET,
      `${env.BACKEND_URL}/api/auth/callback/github`
    );
  }
  return githubClient;
}

function getMicrosoftClient(): MicrosoftEntraId | null {
  if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET) return null;
  if (!microsoftClient) {
    microsoftClient = new MicrosoftEntraId(
      "common",
      env.MICROSOFT_CLIENT_ID,
      env.MICROSOFT_CLIENT_SECRET,
      `${env.BACKEND_URL}/api/auth/callback/microsoft`
    );
  }
  return microsoftClient;
}

export function getOAuthClient(provider: OAuthProvider) {
  switch (provider) {
    case "google":
      return getGoogleClient();
    case "github":
      return getGitHubClient();
    case "microsoft":
      return getMicrosoftClient();
  }
}

export async function getAuthorizationUrl(provider: OAuthProvider, state: string): Promise<string> {
  const scopes = {
    google: ["openid", "email", "profile"],
    github: ["user:email"],
    microsoft: ["openid", "email", "profile"],
  };

  switch (provider) {
    case "google": {
      const client = getGoogleClient();
      if (!client) throw new Error("Google OAuth not configured");
      const codeVerifier = generateCodeVerifier();
      const url = client.createAuthorizationURL(state, codeVerifier, scopes.google);
      // Store code verifier - in production, use a proper session store
      codeVerifiers.set(state, codeVerifier);
      return url.toString();
    }
    case "github": {
      const client = getGitHubClient();
      if (!client) throw new Error("GitHub OAuth not configured");
      const url = client.createAuthorizationURL(state, scopes.github);
      return url.toString();
    }
    case "microsoft": {
      const client = getMicrosoftClient();
      if (!client) throw new Error("Microsoft OAuth not configured");
      const codeVerifier = generateCodeVerifier();
      const url = client.createAuthorizationURL(state, codeVerifier, scopes.microsoft);
      codeVerifiers.set(state, codeVerifier);
      return url.toString();
    }
  }
}

// Simple in-memory store for code verifiers (use Redis in production)
const codeVerifiers = new Map<string, string>();

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Buffer.from(array).toString("base64url");
}

export async function handleCallback(provider: OAuthProvider, code: string): Promise<OAuthUserInfo | null> {
  try {
    switch (provider) {
      case "google":
        return await handleGoogleCallback(code);
      case "github":
        return await handleGitHubCallback(code);
      case "microsoft":
        return await handleMicrosoftCallback(code);
    }
  } catch (error) {
    console.error(`OAuth callback error for ${provider}:`, error);
    return null;
  }
}

async function handleGoogleCallback(code: string): Promise<OAuthUserInfo | null> {
  const client = getGoogleClient();
  if (!client) return null;

  // Get the stored code verifier (simplified - in production use proper session management)
  const state = Array.from(codeVerifiers.keys()).pop();
  const codeVerifier = state ? codeVerifiers.get(state) : undefined;
  if (state) codeVerifiers.delete(state);

  if (!codeVerifier) return null;

  const tokens = await client.validateAuthorizationCode(code, codeVerifier);
  const accessToken = tokens.accessToken();

  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) return null;

  const data = await response.json();
  return {
    email: data.email,
    name: data.name || null,
    pictureUrl: data.picture || null,
    providerId: data.sub,
  };
}

async function handleGitHubCallback(code: string): Promise<OAuthUserInfo | null> {
  const client = getGitHubClient();
  if (!client) return null;

  const tokens = await client.validateAuthorizationCode(code);
  const accessToken = tokens.accessToken();

  // Get user info
  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!userResponse.ok) return null;
  const userData = await userResponse.json();

  // Get primary email
  const emailResponse = await fetch("https://api.github.com/user/emails", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  let email = userData.email;
  if (!email && emailResponse.ok) {
    const emails = await emailResponse.json();
    const primary = emails.find((e: { primary: boolean }) => e.primary);
    email = primary?.email || emails[0]?.email;
  }

  return {
    email,
    name: userData.name || userData.login || null,
    pictureUrl: userData.avatar_url || null,
    providerId: String(userData.id),
  };
}

async function handleMicrosoftCallback(code: string): Promise<OAuthUserInfo | null> {
  const client = getMicrosoftClient();
  if (!client) return null;

  const state = Array.from(codeVerifiers.keys()).pop();
  const codeVerifier = state ? codeVerifiers.get(state) : undefined;
  if (state) codeVerifiers.delete(state);

  if (!codeVerifier) return null;

  const tokens = await client.validateAuthorizationCode(code, codeVerifier);
  const accessToken = tokens.accessToken();

  const response = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) return null;

  const data = await response.json();
  return {
    email: data.mail || data.userPrincipalName,
    name: data.displayName || null,
    pictureUrl: null, // Microsoft Graph requires separate call for photo
    providerId: data.id,
  };
}
