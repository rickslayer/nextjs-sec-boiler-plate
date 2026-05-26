import { verifySession } from "@/lib/dal"
import Link from "next/link"
import { logoutAction } from "@/app/actions/auth"

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // verifySession() redirects to /login if not authenticated
  const session = await verifySession()

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="flex items-center justify-between border-b bg-white px-6 py-3">
        <Link href="/dashboard" className="font-semibold text-blue-600">
          Dashboard
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-600">
            {session.userId} · {session.role}
          </span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded bg-gray-100 px-3 py-1 hover:bg-gray-200"
            >
              Sign Out
            </button>
          </form>
        </div>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  )
}
