"use server"

import { redirect } from "next/navigation"
import { z } from "zod"
import { createSession, deleteSession } from "@/lib/session"

const LoginSchema = z.object({
  email: z.email({ error: "Enter a valid email address." }).trim(),
  password: z.string().min(8, { error: "Password must be at least 8 characters." }),
})

type LoginState =
  | { errors?: { email?: string; password?: string }; message?: string }
  | undefined

export async function loginAction(
  _state: LoginState,
  formData: FormData
): Promise<LoginState> {
  const result = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  })

  if (!result.success) {
    const fieldErrors = result.error.flatten().fieldErrors
    return {
      errors: {
        email: fieldErrors.email?.[0],
        password: fieldErrors.password?.[0],
      },
    }
  }

  const { email, password } = result.data

  // TODO: Replace with your actual user lookup + password verification.
  // Example using bcrypt:
  //   const user = await db.users.findByEmail(email)
  //   const valid = user && await bcrypt.compare(password, user.passwordHash)
  const isValidUser = email === "admin@example.com" && password === "password123"

  if (!isValidUser) {
    return { message: "Invalid email or password." }
  }

  const userId = "user-placeholder-id"
  const role: "admin" | "user" = email.startsWith("admin") ? "admin" : "user"

  await createSession(userId, role)
  redirect("/dashboard")
}

export async function logoutAction(): Promise<void> {
  await deleteSession()
  redirect("/login")
}
