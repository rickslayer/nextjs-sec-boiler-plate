export interface JWTPayload {
  sub: string
  role?: "admin" | "user"
  exp?: number
  iat?: number
}

export interface SessionData {
  userId: string
  role: "admin" | "user"
  expiresAt: Date
}

export type AuthResult =
  | { authenticated: true; userId: string; role: "admin" | "user" }
  | { authenticated: false; reason: string }
