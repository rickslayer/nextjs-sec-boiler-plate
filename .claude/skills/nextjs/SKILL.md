---
name: nextjs
description: |-
 Before do any change check the node_modules/next/dist/docs/ with the last updates from nextjs
 Use this skill WHENEVER the work involves Next.js — creating pages, routes, layouts, components, forms, data fetching, authentication, middleware, configuration, or any file inside app/, pages/, or next.config.{js,ts,mjs}. Also applies when the user mentions "Next", "App Router", "Server Component", "Server Action", "use server", "use client", or asks to review/refactor code in Next.js projects. Ensures use of current Next.js 16 practices (App Router, Server Components by default, Server Actions, explicit caching, async APIs like cookies/headers/params/searchParams) without the user having to ask for it every time.
---

# Next.js 16 — Purple Vault Skill

## Step 0 — Always do this first

Before writing or editing any Next.js code, read the relevant guide:

```
node_modules/next/dist/docs/
```

This is Next.js 16. It has breaking changes from all prior versions. Your training data is wrong about specifics. Read the docs, then act.

---

## Core Rules

### Server Components are the default
Every file inside `app/` is a Server Component unless it starts with `'use client'`. Never add `'use client'` unless the component needs browser APIs, event handlers, or React hooks (`useState`, `useEffect`, `useContext`, etc.).

### Async APIs — params, searchParams, cookies, headers
In Next.js 16 these are all async. Always `await` them.

```ts
// Route handler
export async function GET(req: Request, { params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params
}

// Page component
export default async function Page({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ q: string }>
}) {
  const { id } = await params
  const { q } = await searchParams
}
```

Never destructure params/searchParams synchronously — it will break at runtime.

### Caching is explicit and opt-in
There is no implicit caching. Add `export const dynamic = 'force-dynamic'` to any route handler that reads auth headers, cookies, or live data. Never rely on default caching for authenticated endpoints.

```ts
export const dynamic = 'force-dynamic'
```

### Server Actions use `'use server'`
Inline Server Actions inside Server Components or in dedicated `actions.ts` files. Never call them from API routes.

```ts
// app/some-feature/actions.ts
'use server'

export async function doSomething(formData: FormData) { ... }
```

---

## Project-Specific Patterns

### Authentication — how it works in this project
- Client: `authService` (singleton) manages tokens in memory + sessionStorage
- Access tokens are HS256 JWTs, 15-minute TTL
- Refresh tokens stored as SHA-256 hashes in MongoDB `Session` model
- Cookies: `__Secure-refresh` (HttpOnly, SameSite: strict) + `__csrf` (readable, double-submit CSRF)
- All API routes check auth via `getAuthenticatedUid(req)` from `src/lib/authMiddleware.ts`
- Never trust the client's UID from the request body — always use `getAuthenticatedUid(req)`

```ts
import { getAuthenticatedUid, unauthorized } from '@/lib/authMiddleware'

export async function GET(req: Request) {
  const uid = await getAuthenticatedUid(req)
  if (!uid) return unauthorized()
  // ...
}
```

### API Route conventions
- Place routes under `app/api/`
- Always `export const dynamic = 'force-dynamic'` on auth-sensitive routes
- Await params before use
- Return `NextResponse.json(data, { status })` — never raw `Response`
- Serialize BigInt before returning JSON (MongoDB uses native BigInt for timestamps)

```ts
import { NextResponse } from 'next/server'
import { serializeBigInt } from '@/lib/utils'

// Return
return NextResponse.json(serializeBigInt(data))
```

### Route handler skeleton

```ts
import { NextResponse } from 'next/server'
import { getAuthenticatedUid, unauthorized } from '@/lib/authMiddleware'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ uid: string }> }
) {
  const uid = await getAuthenticatedUid(req)
  if (!uid) return unauthorized()

  const { uid: resourceUid } = await params

  // Always verify the authenticated user owns the resource
  if (uid !== resourceUid) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const data = await prisma.someModel.findFirst({ where: { uid } })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(serializeBigInt(data))
}
```

### Client Component patterns
- Wrap client trees in `ClientShell` (already in `src/components/layout/ClientShell.tsx`) — do not create new provider wrappers
- Get auth state and vault context from `useApp()` (AppContext) — never re-implement auth checks on the client
- Use `useToast()` for user-facing messages, not `alert()`
- Use `useConfirm()` for destructive action confirmations

```tsx
'use client'
import { useApp } from '@/context/AppContext'
import { useToast } from '@/context/ToastContext'

export function MyComponent() {
  const { user, vaultKey } = useApp()
  const { showToast } = useToast()
  // ...
}
```

### Data fetching from client
Use the service layer — never call `fetch` directly from a component. Services are in `src/services/`.

```ts
import { vaultService } from '@/services/vaultService'

const items = await vaultService.getItems(uid)
```

### Component file placement
| What | Where |
|---|---|
| Reusable UI primitives | `src/components/ui/` |
| Dashboard-specific | `src/components/dashboard/` |
| Layout (header/footer/shell) | `src/components/layout/` |
| Full page views (client-heavy) | `src/pages/` (mapped in app/ routes) |

### Tailwind & styling
- Use Tailwind utility classes only — no inline styles, no CSS modules
- Dark mode is the default theme; the design is purple-accented
- Icons: `lucide-react` only, no other icon libraries
- Do not add new UI dependencies without asking

---

## Security constraints — never violate these

1. **Never log sensitive values** — logger redacts `authorization`, `cookie`, `password`, `wrappedVaultKey`, `encryptedPayload`. Do not add new fields that bypass this.
2. **Never store keys in localStorage** — only memory + sessionStorage, only access tokens, never vault keys or passphrases.
3. **Never skip CSRF validation** — mutation endpoints must validate the `x-csrf-token` header against the cookie.
4. **Never trust client-supplied UID** — always derive the UID from the verified JWT.
5. **Rate limiting is applied in middleware** — do not add new sensitive endpoints without adding them to `src/lib/rateLimit.ts`.
6. **Crypto stays client-side** — AES-256-GCM encryption/decryption of vault items happens in the browser. The server never sees plaintext vault data or the vault encryption key (VEK).

---

## Database (Prisma 6 + MongoDB)

- Client singleton: `src/lib/prisma.ts` — always import from there
- BigInt timestamps: `createdAt`, `lastAccessedAt`, `expiresAt`, `timestamp` are BigInt — serialize before JSON responses
- Relations use `uid` (Firebase UID string), not numeric IDs
- Do not use `findUnique` with MongoDB — use `findFirst` with a unique field in `where`

```ts
// Wrong for MongoDB
await prisma.user.findUnique({ where: { uid } })

// Correct
await prisma.user.findFirst({ where: { uid } })
```

---

## next.config.ts checklist

- `output: 'standalone'` is set — do not remove it (required for Docker/k8s)
- `serverActions.allowedOrigins` must include any new domains before Server Actions work from them
- Experimental flags require a docs check before adding

---

## Common mistakes to avoid

| Mistake | Correct approach |
|---|---|
| Synchronous `params` access | `const { id } = await params` |
| `localStorage` for tokens | `sessionStorage` or memory only |
| `Response.json()` | `NextResponse.json()` |
| Creating new prisma client instances | Import `prisma` from `@/lib/prisma` |
| Calling crypto in a Server Component | Crypto runs in the browser — use client components or services |
| Skipping `dynamic = 'force-dynamic'` | Add it to every auth-sensitive route handler |
| Using `findUnique` with MongoDB | Use `findFirst` |
| `console.log` | Use `logger` from `@/lib/logger` with structured context |
