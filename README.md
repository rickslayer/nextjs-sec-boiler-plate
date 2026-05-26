# Next.js 16 Security Boilerplate

[![CI](../../actions/workflows/ci.yml/badge.svg)](../../actions/workflows/ci.yml)
[![Security](../../actions/workflows/security.yml/badge.svg)](../../actions/workflows/security.yml)
[![CodeQL](../../actions/workflows/codeql.yml/badge.svg)](../../actions/workflows/codeql.yml)

A production-ready Next.js 16 starter with security baked in from day one.

## What's Included

| Feature | File | Notes |
|---|---|---|
| **Proxy (Middleware)** | `src/proxy.ts` | Rate limiting · CORS · Required headers · JWT auth |
| **JWT Auth** | `src/lib/jwt.ts` | HS256 via `jose`, lightweight, proxy-safe |
| **Session Management** | `src/lib/session.ts` | HttpOnly cookie, server-only |
| **Data Access Layer** | `src/lib/dal.ts` | `verifySession()` cached per render pass |
| **Rate Limiter** | `src/lib/rate-limit.ts` | Fixed-window, configurable via env |
| **Secret Scanner** | `scripts/check-secrets.mjs` | Blocks build on hardcoded secrets |
| **npm audit gate** | `package.json` prebuild | Blocks build on CRITICAL vulnerabilities |
| **Security Headers** | `next.config.ts` | CSP · HSTS · X-Frame-Options · etc. |

---

## Quick Start

### 1. Clone and install

```bash
cp -r nextjs-sec-boiler-plate my-project
cd my-project
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in every value. At minimum:

```bash
# Generate strong secrets (run each command separately)
openssl rand -base64 48   # → JWT_SECRET
openssl rand -base64 48   # → SESSION_SECRET
```

**Never commit `.env.local` to version control.**

### 3. Run in development

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000).

### 4. Build for production

```bash
npm run build
```

The `prebuild` step runs two checks automatically:
1. `npm audit --audit-level=critical` — fails if any dependency has a CRITICAL CVE.
2. `node scripts/check-secrets.mjs` — fails if hardcoded secrets are detected in `src/`.

---

## Environment Variables

### Rate Limiter

| Variable | Default | Description |
|---|---|---|
| `RATE_LIMIT_WINDOW_MS` | `60000` | Sliding window in milliseconds (60 s) |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Max requests per window per identifier |
| `RATE_LIMIT_IDENTIFIER` | `ip` | `ip` or `header` (reads `x-forwarded-for`) |

> **Multi-instance note:** The default rate limiter uses an in-memory `Map`. For deployments with multiple Node.js processes (e.g. Kubernetes, PM2 cluster), replace the store in `src/lib/rate-limit.ts` with Redis.

### CORS

| Variable | Default | Description |
|---|---|---|
| `ALLOWED_ORIGINS` | _(empty = allow all)_ | Comma-separated list of allowed origins |

Example: `ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com`

An empty value allows all origins — useful for local development, **not recommended for production**.

### Required Headers

| Variable | Default | Description |
|---|---|---|
| `REQUIRED_HEADERS` | _(empty = none)_ | Comma-separated headers enforced on `/api/*` |

Format: `header-name` or `header-name:expected-value`

Example: `REQUIRED_HEADERS=x-api-key,x-client-version:2`

Every `/api/*` request that lacks any required header receives `400 Bad Request`.

### JWT

| Variable | Default | Description |
|---|---|---|
| `JWT_SECRET` | — | **Required.** Min 32 chars. Used to sign/verify all tokens. |
| `JWT_EXPIRATION` | `7d` | Token expiry. Accepts `jose` duration strings: `1h`, `7d`, `30d`. |
| `SESSION_SECRET` | — | **Required.** Min 32 chars. Separate from JWT secret. |

---

## Architecture

```
src/
├── proxy.ts                  # Next.js 16 Proxy (runs before every request)
├── lib/
│   ├── jwt.ts                # JWT sign/verify — no server-only, safe for proxy
│   ├── session.ts            # Cookie session — server-only
│   ├── dal.ts                # Data Access Layer — verifySession(), getCurrentUser()
│   └── rate-limit.ts         # In-memory rate limiter
├── types/
│   └── auth.ts               # Shared types: JWTPayload, SessionData
└── app/
    ├── layout.tsx
    ├── page.tsx
    ├── actions/
    │   └── auth.ts           # loginAction, logoutAction (Server Actions)
    ├── (auth)/
    │   └── login/page.tsx    # Login form (client component + Server Action)
    ├── (protected)/
    │   ├── layout.tsx        # Calls verifySession() — redirects if unauth
    │   └── dashboard/page.tsx
    └── api/
        ├── auth/
        │   ├── login/route.ts   # REST login → returns JWT + sets cookie
        │   └── logout/route.ts  # Clears session cookie
        ├── protected/
        │   └── me/route.ts      # Example protected API route
        └── health/route.ts      # Health check (rate-limit exempt)
```

### Authentication Flow

```
Browser                  Proxy (proxy.ts)          Server
   │                          │                       │
   │── POST /api/auth/login ──▶│ rate-limit check      │
   │                          │──────────────────────▶│
   │                          │              validate credentials
   │                          │              signJWT() + createSession()
   │◀── 200 { token } ────────│◀──────────────────────│
   │    Set-Cookie: session=… │                       │
   │                          │                       │
   │── GET /dashboard ────────▶│ verifyJWT(cookie)     │
   │                          │ → sets x-user-id hdr  │
   │                          │──────────────────────▶│
   │                          │             verifySession() in DAL
   │◀── 200 HTML ─────────────│◀──────────────────────│
```

**Defence in depth:** the proxy is an optimistic check (fast redirect). Every protected Server Component and Route Handler calls `verifySession()` from the DAL independently.

---

## Security Features

### Proxy (`src/proxy.ts`)

The proxy runs before every request (except static assets).

- **CORS:** Reads `ALLOWED_ORIGINS`. Returns `403` for disallowed origins on preflight, attaches `Access-Control-*` headers on simple requests.
- **Required headers:** Any request to `/api/*` missing a configured header gets `400`.
- **Rate limiting:** Returns `429` with `X-RateLimit-*` and `Retry-After` headers.
- **JWT auth:** Protected routes redirect (pages) or `401` (APIs) if token is missing or invalid. Verified user ID and role are forwarded via `x-user-id` / `x-user-role` headers.

### Security Headers (`next.config.ts`)

Applied to every response:

| Header | Value |
|---|---|
| `X-Frame-Options` | `SAMEORIGIN` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `Content-Security-Policy` | Restrictive default (customize for your CDN/fonts) |

### Build Gate

Every `npm run build` runs:

1. **`npm audit --audit-level=critical`** — fails on CRITICAL CVEs in the dependency tree.
2. **`node scripts/check-secrets.mjs`** — scans `src/` for:
   - PEM private keys
   - AWS credentials
   - Hardcoded JWT tokens
   - GitHub/Slack/Stripe/Google API keys
   - Generic `secret = "..."` assignments
   - `NEXT_PUBLIC_` variables with secret-like names

Run the scanner at any time: `npm run check-secrets`

---

## Suggested Additional Topics

Below are security areas this boilerplate sets up hooks for but leaves intentionally unimplemented — pick what fits your app:

### 1. CSRF Protection
Server Actions in Next.js 16 are protected by the `Origin` header check built into the framework. For custom form submissions via `fetch`, add a CSRF token using the `double-submit cookie` pattern or integrate `csrf-csrf`.

### 2. Input Sanitisation / XSS
Zod validates shape and types but does not sanitise HTML. Add `DOMPurify` (client) or `sanitize-html` (server) for any user-generated content rendered as HTML.

### 3. Database Row-Level Security
After wiring in a real database (Prisma, Drizzle, etc.), add user-scoped queries. The `verifySession()` in `dal.ts` is the right place to attach the current user's ID to every DB call.

### 4. Refresh Token Rotation
The current JWT is long-lived (7 days). For higher-security apps, issue short-lived access tokens (15 min) and a rotating refresh token stored in the DB.

### 5. Multi-Factor Authentication (MFA)
Integrate TOTP (e.g. `otpauth` library) or a passkey flow after the primary credential check in `loginAction`.

### 6. Audit Logging
Add a server-side logger (Pino, Winston) to record auth events (login, logout, failed attempts, rate-limit hits) with user ID, IP, and timestamp.

### 7. Redis-backed Rate Limiter
Replace the in-memory `Map` in `src/lib/rate-limit.ts` with an `ioredis` client for distributed rate limiting across multiple instances. The interface is already isolated to that one file.

### 8. IP Allow/Deny Lists
Add an IP blocklist check in the proxy before the rate limiter. Useful for geo-blocking or banning known bad actors.

### 9. Secrets Management (production)
Replace `.env.local` with a secrets manager (AWS Secrets Manager, GCP Secret Manager, HashiCorp Vault). Access secrets at startup via SDK, never bake them into images.

### 10. Dependency Update Automation
Add Dependabot or Renovate to keep dependencies patched. The `npm audit` prebuild gate catches critical CVEs, but automated PRs keep the baseline low.

---

## GitHub Actions Workflows

Three workflows protect the repository at different layers. All results appear directly in the pull request status checks.

```
.github/workflows/
├── ci.yml         — every push + PR on any branch
├── security.yml   — PRs/pushes to main + weekly Monday 08:00 UTC
└── codeql.yml     — PRs/pushes to main + weekly Monday 09:00 UTC
```

### `ci.yml` — Continuous Integration

Runs on **every push and pull request** across all branches. All five jobs must pass before a PR can be merged.

| Job | What it checks | Blocks merge? |
|---|---|---|
| **Secret Scan** | `scripts/check-secrets.mjs` — 12 secret patterns in `src/` | Yes |
| **Type Check** | `tsc --noEmit` strict mode | Yes |
| **Lint** | ESLint with Next.js ruleset | Yes |
| **Audit (Critical)** | `npm audit --audit-level=critical` | Yes |
| **Build** | `next build` — compiles with production settings | Yes (needs above 3) |

The build job also uploads the compiled `.next/` as an artifact (3-day retention) so a deploy workflow can consume it without rebuilding.

### `security.yml` — Security Gate

Runs on **PRs to main**, **pushes to main**, and **weekly on Mondays**. Focuses on what `ci.yml` does not: the full vulnerability surface and structural correctness of the security config.

| Job | Trigger | What it checks |
|---|---|---|
| **Secret Scan** | all | Same scanner as CI, but emits `::error::` annotations pointing to exact file:line in the diff |
| **Dependency Review** | PRs only | Blocks merges that introduce **HIGH or CRITICAL** CVEs via `actions/dependency-review-action` |
| **Audit Report** | all | Full JSON audit across all severities; count table written to Job Summary; JSON artifact retained 30 days |
| **Verify Security Headers** | all | Asserts that all 5 required headers still exist in `next.config.ts` |
| **Verify Proxy Integrity** | all | Asserts `proxy.ts` exports `proxy` (not `middleware`), has a matcher config |
| **Verify No .env Files** | all | Fails if any `.env*` file (other than `.env.example`) was committed |

#### Enabling the Dependency Review action

The `dependency-review-action` requires the repository's **dependency graph** to be enabled.
Go to **Settings → Security → Code security → Dependency graph** and enable it (auto-on for public repos).

### `codeql.yml` — Static Application Security Testing (SAST)

Runs on **PRs to main**, **pushes to main**, and **weekly on Mondays**.

Uses GitHub's CodeQL engine with the **`security-extended` + `security-and-quality`** query suites, which cover:

- SQL / command / path-traversal injection (CWE-89, 78, 22)
- XSS — reflected, stored, DOM-based (CWE-79)
- Open redirect (CWE-601)
- Insecure randomness / weak crypto (CWE-338, 327)
- Prototype pollution (CWE-1321)
- Regex DoS / ReDoS (CWE-400)
- Hardcoded credentials (CWE-798) — secondary to our own scanner
- 50+ additional CWEs

Results appear in **Security → Code scanning alerts** and as PR annotations on the affected lines.

#### Enabling CodeQL

CodeQL analysis is free for public repositories. For private repositories it requires **GitHub Advanced Security** (included in GitHub Enterprise).

### Required repository settings

To enforce the CI and Security workflows as merge requirements:

1. Go to **Settings → Branches → Add branch protection rule** for `main`
2. Enable **Require status checks to pass before merging**
3. Add the following required checks:
   - `Secret Scan` (ci.yml)
   - `Type Check` (ci.yml)
   - `Audit (Critical)` (ci.yml)
   - `Build` (ci.yml)
   - `Dependency Review` (security.yml — PRs only)
   - `CodeQL Analysis` (codeql.yml)

### Dependabot (recommended addition)

Create `.github/dependabot.yml` to keep dependencies patched automatically:

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
      day: monday
    open-pull-requests-limit: 5
    groups:
      next-ecosystem:
        patterns: ["next", "react", "react-dom", "eslint-config-next"]
```

Dependabot PRs will be gated by all three workflows automatically.

---

## Production Checklist

- [ ] `JWT_SECRET` and `SESSION_SECRET` are unique, random, ≥32 chars
- [ ] `ALLOWED_ORIGINS` is set to your actual domain(s)
- [ ] `REQUIRED_HEADERS` is configured if you use an API gateway / WAF
- [ ] `.env.local` / `.env.production` are **not** committed to git
- [ ] `npm audit --audit-level=critical` passes with zero issues
- [ ] `npm run check-secrets` passes with zero critical findings
- [ ] CSP in `next.config.ts` is tightened for your actual assets/CDN
- [ ] HSTS preload is submitted to [hstspreload.org](https://hstspreload.org)
- [ ] Rate limits are tuned to your expected traffic
- [ ] Login placeholder replaced with real user lookup + bcrypt password check
- [ ] Error messages do not leak stack traces or internal paths in production
- [ ] Branch protection rules configured on `main` (see above)
- [ ] CodeQL enabled (public repo or GitHub Advanced Security)
- [ ] Dependabot configured for weekly dependency updates

---

## License

MIT
