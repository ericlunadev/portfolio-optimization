import * as jose from "jose";
import { env } from "../config/env.js";

const secret = new TextEncoder().encode(env.JWT_SECRET_KEY);

export interface TokenPayload {
  sub: number; // User ID (parsed from string)
  email: string;
  iat: number;
  exp: number;
}

export async function createAccessToken(userId: number, email: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = env.ACCESS_TOKEN_EXPIRE_MINUTES * 60;

  return new jose.SignJWT({ sub: String(userId), email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + expiresIn)
    .sign(secret);
}

export async function verifyAccessToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jose.jwtVerify(token, secret);
    return {
      sub: Number(payload.sub),
      email: payload.email as string,
      iat: payload.iat ?? 0,
      exp: payload.exp ?? 0,
    };
  } catch {
    return null;
  }
}

export function generateRefreshToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Buffer.from(array).toString("base64url");
}

export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Buffer.from(hashBuffer).toString("hex");
}
