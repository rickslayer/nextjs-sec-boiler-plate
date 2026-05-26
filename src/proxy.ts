/**
 * Next.js 16 Proxy (formerly Middleware).
 *
 * Responsibilities (in order):
 *   1. CORS — validate Origin against ALLOWED_ORIGINS env var
 *   2. Required headers — enforce REQUIRED_HEADERS env var on /api/* routes
 *   3. Rate limiting — fixed-window counter keyed by IP or header
 *   4. JWT authentication — protect routes in PROTECTED_ROUTES
 *
 * Authentication strategy:
 *   - Proxy does OPTIMISTIC checks only (reads JWT from cookie/header).
 *   - Always re-verify inside Server Actions and Route Handlers via dal.ts.
 *   - See: https://nextjs.org/docs/app/guides/authentication#optimistic-checks-with-proxy-optional
 */

import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { checkRateLimit } from "@/lib/rate-limit"
import { verifyJWT } from "@/lib/jwt"

// ---------------------------------------------------------------------------
// Route classification
// ---------------------------------------------------------------------------

/** Prefixes that require a valid JWT (cookie or Authorization: Bearer). */
const PROTECTED_PREFIXES = ["/dashboard", "/api/protected"]

/** Paths exempt from rate limiting (e.g. health checks). */
const RATE_LIMIT_EXEMPT_PATHS = ["/api/health"]

/** API path prefix — used to decide whether to JSON-error or redirect. */
const API_PREFIX = "/api/"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAllowedOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean)
}

function getRequiredHeaders(): Array<{ key: string; expectedValue?: string }> {
  return (process.env.REQUIRED_HEADERS ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean)
    .map((h) => {
      const [key, expectedValue] = h.split(":").map((s) => s.trim())
      return expectedValue ? { key, expectedValue } : { key }
    })
}

function extractBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get("authorization")
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7)
  return request.cookies.get("session")?.value ?? null
}

function getClientIdentifier(request: NextRequest): string {
  const mode = process.env.RATE_LIMIT_IDENTIFIER ?? "ip"
  if (mode === "header") {
    return (
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
      request.headers.get("x-real-ip") ??
      "unknown"
    )
  }
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  )
}

function addCORSHeaders(
  response: NextResponse,
  origin: string,
  isAllowed: boolean
): void {
  if (!origin || !isAllowed) return
  response.headers.set("Access-Control-Allow-Origin", origin)
  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS"
  )
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  )
  response.headers.set("Access-Control-Allow-Credentials", "true")
}

// ---------------------------------------------------------------------------
// Main proxy function
// ---------------------------------------------------------------------------

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const origin = request.headers.get("origin") ?? ""
  const allowedOrigins = getAllowedOrigins()

  // Allow all origins when ALLOWED_ORIGINS is not configured (dev convenience).
  const isAllowedOrigin =
    allowedOrigins.length === 0 || !origin || allowedOrigins.includes(origin)

  // ------------------------------------------------------------------
  // 1. CORS — handle OPTIONS preflight
  // ------------------------------------------------------------------
  if (request.method === "OPTIONS") {
    if (!isAllowedOrigin) {
      return new Response(null, { status: 403 })
    }
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods":
          "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400",
      },
    })
  }

  // ------------------------------------------------------------------
  // 2. Required headers — enforce on /api/* routes only
  // ------------------------------------------------------------------
  if (pathname.startsWith(API_PREFIX)) {
    const requiredHeaders = getRequiredHeaders()
    for (const { key, expectedValue } of requiredHeaders) {
      const actualValue = request.headers.get(key)
      if (!actualValue) {
        return Response.json(
          { success: false, message: `Missing required header: ${key}` },
          { status: 400 }
        )
      }
      if (expectedValue && actualValue !== expectedValue) {
        return Response.json(
          {
            success: false,
            message: `Invalid value for required header: ${key}`,
          },
          { status: 400 }
        )
      }
    }
  }

  // ------------------------------------------------------------------
  // 3. Rate limiting
  // ------------------------------------------------------------------
  if (!RATE_LIMIT_EXEMPT_PATHS.includes(pathname)) {
    const identifier = getClientIdentifier(request)
    const { allowed, remaining, resetAt, limit } = checkRateLimit(identifier)

    const rateLimitHeaders = {
      "X-RateLimit-Limit": String(limit),
      "X-RateLimit-Remaining": String(remaining),
      "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
    }

    if (!allowed) {
      return Response.json(
        {
          success: false,
          message: "Too many requests. Please slow down.",
        },
        {
          status: 429,
          headers: {
            ...rateLimitHeaders,
            "Retry-After": String(
              Math.ceil((resetAt - Date.now()) / 1000)
            ),
          },
        }
      )
    }
  }

  // ------------------------------------------------------------------
  // 4. JWT authentication — protect configured routes
  // ------------------------------------------------------------------
  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  )

  if (isProtected) {
    const token = extractBearerToken(request)

    if (!token) {
      if (pathname.startsWith(API_PREFIX)) {
        return Response.json(
          { success: false, message: "Unauthorized" },
          { status: 401 }
        )
      }
      return NextResponse.redirect(new URL("/login", request.url))
    }

    const payload = await verifyJWT(token)

    if (!payload) {
      if (pathname.startsWith(API_PREFIX)) {
        return Response.json(
          { success: false, message: "Invalid or expired token" },
          { status: 401 }
        )
      }
      return NextResponse.redirect(new URL("/login", request.url))
    }

    // Forward verified user info to downstream handlers via request headers.
    // Handlers can read these without re-verifying the JWT.
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set("x-user-id", payload.sub)
    requestHeaders.set("x-user-role", payload.role ?? "user")

    const response = NextResponse.next({ request: { headers: requestHeaders } })
    addCORSHeaders(response, origin, isAllowedOrigin)
    return response
  }

  // ------------------------------------------------------------------
  // Pass-through — attach CORS headers
  // ------------------------------------------------------------------
  const response = NextResponse.next()
  addCORSHeaders(response, origin, isAllowedOrigin)
  return response
}

// ---------------------------------------------------------------------------
// Matcher — runs on all routes except static assets
// ---------------------------------------------------------------------------
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$|.*\\.ico$).*)",
  ],
}
