import type { NextRequest } from "next/server"

/**
 * Example protected API route.
 * The proxy has already verified the JWT and forwarded x-user-id / x-user-role.
 * We still read from the headers here (no DB call needed for this lightweight example).
 * For sensitive operations, re-verify with verifySession() from dal.ts.
 */
export async function GET(request: NextRequest) {
  const userId = request.headers.get("x-user-id")
  const role = request.headers.get("x-user-role")

  if (!userId) {
    // Proxy should have blocked this, but defence-in-depth.
    return Response.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  return Response.json({ success: true, userId, role }, { status: 200 })
}
