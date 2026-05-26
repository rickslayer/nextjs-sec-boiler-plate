/**
 * In-memory fixed-window rate limiter.
 *
 * Suitable for single-process (single Node.js instance) deployments.
 * For multi-instance / serverless deployments replace the store with Redis:
 *   RATE_LIMIT_STORE=redis + REDIS_URL env vars (add ioredis and implement below).
 *
 * Entries are cleaned up lazily on each request to prevent unbounded growth.
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

let lastCleanup = Date.now()
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000 // clean up every 5 minutes

function cleanup(now: number): void {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return
  lastCleanup = now
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt < now) store.delete(key)
  }
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
  limit: number
}

export function checkRateLimit(identifier: string): RateLimitResult {
  const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? "60000", 10)
  const limit = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? "100", 10)
  const now = Date.now()

  cleanup(now)

  const entry = store.get(identifier)

  if (!entry || entry.resetAt < now) {
    store.set(identifier, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs, limit }
  }

  entry.count++

  if (entry.count > limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt, limit }
  }

  return {
    allowed: true,
    remaining: limit - entry.count,
    resetAt: entry.resetAt,
    limit,
  }
}
