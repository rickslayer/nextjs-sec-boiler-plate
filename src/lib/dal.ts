import "server-only"
import { cache } from "react"
import { redirect } from "next/navigation"
import { getSession } from "@/lib/session"
import type { SessionData } from "@/types/auth"

/**
 * Data Access Layer — centralises auth verification for Server Components,
 * Server Actions, and Route Handlers.
 *
 * verifySession() is wrapped in React cache() so multiple calls within the
 * same render pass hit the cookie / JWT only once.
 */
export const verifySession = cache(async (): Promise<SessionData> => {
  const session = await getSession()

  if (!session) {
    redirect("/login")
  }

  return session
})

/**
 * Returns the current user or null (does NOT redirect).
 * Use when you need to conditionally render based on auth state.
 */
export const getCurrentUser = cache(async (): Promise<SessionData | null> => {
  return getSession()
})

/**
 * Guard that also checks for admin role.
 * Redirects to /login if unauthenticated, returns 403 JSON if not admin.
 */
export const verifyAdmin = cache(async (): Promise<SessionData> => {
  const session = await verifySession()

  if (session.role !== "admin") {
    // In Route Handlers you should throw a Response instead of redirecting.
    // This helper is intended for Server Components; for Route Handlers use
    // verifySession() + check role manually.
    redirect("/")
  }

  return session
})
