# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

## Critical differences in Next.js 16

- **Middleware is renamed to Proxy** — the file is `proxy.ts` (not `middleware.ts`), and the export is `export function proxy()` (not `middleware`).
- **`cookies()`, `headers()`, `params`, `searchParams` are async** — always `await` them.
- **No Edge Runtime in proxy by default** — proxy now runs Node.js runtime.
- **`server-only`** — import this at the top of any file that must never reach the client.
- **Zod 4** is in use — the `error` key replaces `message` in schema definitions.
