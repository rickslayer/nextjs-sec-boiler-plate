#!/usr/bin/env node
/**
 * Build-time secret scanner.
 *
 * Scans all TypeScript/JavaScript source files in src/ for common patterns
 * that indicate hardcoded secrets, private keys, or sensitive credentials.
 *
 * Exit codes:
 *   0 — no issues found
 *   1 — critical issues found (blocks the build)
 *
 * Run manually: node scripts/check-secrets.mjs
 * Runs automatically as part of `npm run prebuild`.
 */

import { readFileSync, readdirSync, statSync } from "fs"
import { join, relative } from "path"

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ROOT = new URL("..", import.meta.url).pathname
const SCAN_DIRS = ["src"]
const SCAN_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]
const IGNORE_DIRS = ["node_modules", ".next", ".git", "dist", "build"]
const IGNORE_FILES = ["check-secrets.mjs"] // skip ourselves

/** Patterns that indicate a hardcoded secret. */
const SECRET_PATTERNS = [
  {
    name: "Private key (PEM block)",
    pattern: /-----BEGIN\s+(RSA\s+|EC\s+|DSA\s+|OPENSSH\s+)?PRIVATE KEY-----/,
    severity: "critical",
  },
  {
    name: "AWS Access Key ID",
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
    severity: "critical",
  },
  {
    name: "AWS Secret Access Key (heuristic)",
    pattern: /aws[_\-.]?secret[_\-.]?(access[_\-.]?)?key\s*[:=]\s*["'][A-Za-z0-9/+]{40}["']/i,
    severity: "critical",
  },
  {
    name: "Hardcoded JWT token (eyJ prefix)",
    // Matches a full 3-part JWT assigned to a variable/literal, not a comment
    pattern: /(?<![/#*])\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/,
    severity: "critical",
  },
  {
    name: "Generic secret/password assignment with literal string",
    pattern: /(?:secret|password|passwd|api[_-]?key|auth[_-]?token)\s*[:=]\s*["'][^"']{8,}["']/i,
    severity: "warning",
  },
  {
    name: "GitHub personal access token",
    pattern: /\bghp_[A-Za-z0-9]{36}\b/,
    severity: "critical",
  },
  {
    name: "GitHub OAuth token",
    pattern: /\bgho_[A-Za-z0-9]{36}\b/,
    severity: "critical",
  },
  {
    name: "Slack bot token",
    pattern: /\bxoxb-[0-9]{11,13}-[0-9]{11,13}-[A-Za-z0-9]{24}\b/,
    severity: "critical",
  },
  {
    name: "Stripe secret key",
    pattern: /\bsk_(live|test)_[A-Za-z0-9]{24,}\b/,
    severity: "critical",
  },
  {
    name: "Google API key",
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/,
    severity: "critical",
  },
  {
    name: "Exposed NEXT_PUBLIC_ variable with secret-like name",
    // Warns when a NEXT_PUBLIC_ variable has a name that looks like a secret
    pattern: /NEXT_PUBLIC_(?:SECRET|KEY|TOKEN|PASSWORD|PASS|API_KEY)[^"'`\s]*/i,
    severity: "warning",
  },
]

// Patterns that are safe to ignore (e.g. references to env vars, placeholder text)
const SAFE_PATTERNS = [
  /process\.env\./,
  /process\.env\[/,
  /replace-with/i,
  /your[_-]?secret/i,
  /placeholder/i,
  /example\.com/,
  /\bfoo\b|\bbar\b|\bbaz\b/,
  /TODO/,
]

// ---------------------------------------------------------------------------
// File walker
// ---------------------------------------------------------------------------

function* walkDir(dir) {
  for (const entry of readdirSync(dir)) {
    if (IGNORE_DIRS.includes(entry)) continue
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      yield* walkDir(fullPath)
    } else if (SCAN_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      if (!IGNORE_FILES.includes(entry)) yield fullPath
    }
  }
}

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

function scanFile(filePath) {
  const content = readFileSync(filePath, "utf8")
  const lines = content.split("\n")
  const findings = []

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]

    // Skip comment lines
    const trimmed = line.trim()
    if (
      trimmed.startsWith("//") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("#")
    ) {
      continue
    }

    for (const { name, pattern, severity } of SECRET_PATTERNS) {
      if (!pattern.test(line)) continue

      // Check if the line contains any safe pattern
      if (SAFE_PATTERNS.some((safe) => safe.test(line))) continue

      findings.push({
        file: relative(ROOT, filePath),
        line: lineIndex + 1,
        content: line.trim().slice(0, 120),
        name,
        severity,
      })
    }
  }

  return findings
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

let allFindings = []

for (const dir of SCAN_DIRS) {
  const absDir = join(ROOT, dir)
  try {
    for (const filePath of walkDir(absDir)) {
      allFindings = allFindings.concat(scanFile(filePath))
    }
  } catch {
    // dir doesn't exist yet — skip
  }
}

const critical = allFindings.filter((f) => f.severity === "critical")
const warnings = allFindings.filter((f) => f.severity === "warning")

if (allFindings.length === 0) {
  console.log("✅ Secret scan passed — no issues found.\n")
  process.exit(0)
}

if (warnings.length > 0) {
  console.warn(`\n⚠️  Secret scan warnings (${warnings.length}):\n`)
  for (const f of warnings) {
    console.warn(`  ${f.file}:${f.line}`)
    console.warn(`    Rule    : ${f.name}`)
    console.warn(`    Content : ${f.content}`)
    console.warn()
  }
}

if (critical.length > 0) {
  console.error(`\n🚨 Secret scan CRITICAL issues (${critical.length}) — build blocked:\n`)
  for (const f of critical) {
    console.error(`  ${f.file}:${f.line}`)
    console.error(`    Rule    : ${f.name}`)
    console.error(`    Content : ${f.content}`)
    console.error()
  }
  console.error(
    "Fix the issues above before building. If this is a false positive,\n" +
    "add a process.env reference or a safe-pattern comment to the line.\n"
  )
  process.exit(1)
}

// Only warnings — don't block the build
process.exit(0)
