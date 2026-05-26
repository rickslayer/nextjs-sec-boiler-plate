import "server-only"
import { cookies } from "next/headers"
import { signJWT, verifyJWT } from "@/lib/jwt"
import type { SessionData } from "@/types/auth"

const COOKIE_NAME = "session"
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000

export async function createSession(
  userId: string,
  role: "admin" | "user" = "user"
): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)
  const token = await signJWT({ sub: userId, role })
  const cookieStore = await cookies()

  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    sameSite: "lax",
    path: "/",
  })
}

export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value

  if (!token) return null

  const payload = await verifyJWT(token)
  if (!payload?.sub) return null

  return {
    userId: payload.sub,
    role: payload.role ?? "user",
    expiresAt: new Date((payload.exp ?? 0) * 1000),
  }
}

export async function updateSession(): Promise<void> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return

  const payload = await verifyJWT(token)
  if (!payload?.sub) return

  await createSession(payload.sub, payload.role ?? "user")
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}
