/**
 * Health check — exempt from rate limiting (see RATE_LIMIT_EXEMPT_PATHS in proxy.ts).
 * Used by load balancers, container orchestrators, and uptime monitors.
 */
export async function GET() {
  return Response.json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? "unknown",
    },
    { status: 200 }
  )
}
