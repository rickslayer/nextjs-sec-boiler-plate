import Link from "next/link"
import { getCurrentUser } from "@/lib/dal"

export default async function HomePage() {
  const user = await getCurrentUser()

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-bold">Next.js Security Boilerplate</h1>
      <p className="text-gray-600">
        JWT authentication · Rate limiting · CORS · Required headers
      </p>

      {user ? (
        <div className="flex flex-col items-center gap-4">
          <p className="text-green-600">
            Signed in as <strong>{user.userId}</strong> ({user.role})
          </p>
          <Link
            href="/dashboard"
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            Go to Dashboard
          </Link>
        </div>
      ) : (
        <Link
          href="/login"
          className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          Sign In
        </Link>
      )}
    </main>
  )
}
