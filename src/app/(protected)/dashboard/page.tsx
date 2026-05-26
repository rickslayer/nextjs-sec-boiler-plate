import { verifySession } from "@/lib/dal"

export default async function DashboardPage() {
  // verifySession() re-verifies on every render — do not rely only on the proxy check.
  const session = await verifySession()

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="rounded-lg border bg-white p-4">
        <h2 className="mb-2 font-semibold">Session Info</h2>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-gray-500">User ID</dt>
          <dd>{session.userId}</dd>
          <dt className="text-gray-500">Role</dt>
          <dd>{session.role}</dd>
          <dt className="text-gray-500">Expires</dt>
          <dd>{session.expiresAt.toLocaleString()}</dd>
        </dl>
      </div>

      <div className="rounded-lg border bg-white p-4">
        <h2 className="mb-2 font-semibold">Security Features Active</h2>
        <ul className="list-inside list-disc space-y-1 text-sm text-gray-600">
          <li>JWT authentication (HS256 via jose)</li>
          <li>Rate limiting (fixed window, in-memory)</li>
          <li>CORS origin validation</li>
          <li>Required headers enforcement on /api/*</li>
          <li>Strict security headers (CSP, HSTS, X-Frame-Options…)</li>
          <li>Build-time secret scanner</li>
          <li>npm audit at CRITICAL level on every build</li>
        </ul>
      </div>
    </div>
  )
}
