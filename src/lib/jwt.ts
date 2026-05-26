/**
 * Lightweight JWT utilities — safe to import from proxy.ts (no server-only).
 * For session cookie management, use src/lib/session.ts instead.
 */
import { SignJWT, jwtVerify } from "jose"
import type { JWTPayload } from "@/types/auth"

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be set and at least 32 characters long")
  }
  return new TextEncoder().encode(secret)
}

export async function signJWT(
  payload: Omit<JWTPayload, "exp" | "iat">
): Promise<string> {
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(process.env.JWT_EXPIRATION ?? "7d")
    .sign(getSecret())
}

export async function verifyJWT(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
    })
    return payload as JWTPayload
  } catch {
    return null
  }
}
