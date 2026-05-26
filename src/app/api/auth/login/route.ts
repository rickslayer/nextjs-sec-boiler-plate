import { z } from "zod"
import { signJWT } from "@/lib/jwt"
import { createSession } from "@/lib/session"

const LoginSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
})

/**
 * REST login endpoint — returns a JWT in the response body AND sets a session cookie.
 * Use this for API clients; use the Server Action in loginAction for browser forms.
 */
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ success: false, message: "Invalid JSON body" }, { status: 400 })
  }

  const result = LoginSchema.safeParse(body)
  if (!result.success) {
    return Response.json(
      { success: false, errors: result.error.flatten().fieldErrors },
      { status: 422 }
    )
  }

  const { email, password } = result.data

  // TODO: Replace with your actual user lookup + password verification.
  const isValidUser = email === "admin@example.com" && password === "password123"

  if (!isValidUser) {
    // Use a generic message to avoid user enumeration.
    return Response.json(
      { success: false, message: "Invalid credentials" },
      { status: 401 }
    )
  }

  const userId = "user-placeholder-id"
  const role: "admin" | "user" = email.startsWith("admin") ? "admin" : "user"

  const token = await signJWT({ sub: userId, role })

  // Set HttpOnly cookie for browser clients
  await createSession(userId, role)

  return Response.json({ success: true, token }, { status: 200 })
}
