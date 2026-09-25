/**
 * Patterns matching common credentials, tokens, and secrets
 */
const SECRET_PATTERNS: Array<{ regex: RegExp; replacement: string }> = [
  // Gemini API Key: AIzaSy...
  {
    regex: /AIzaSy[A-Za-z0-9_-]{20,50}/g,
    replacement: '[REDACTED_GEMINI_KEY]',
  },
  // OpenRouter API Key: sk-or-v1-...
  {
    regex: /sk-or-[A-Za-z0-9_-]+/g,
    replacement: '[REDACTED_OPENROUTER_KEY]',
  },
  // OpenAI / Generic sk-... keys
  {
    regex: /sk-[A-Za-z0-9_-]{20,}/g,
    replacement: '[REDACTED_API_KEY]',
  },
  // Vercel Access Token
  {
    regex: /vercel_[A-Za-z0-9_-]{20,}/g,
    replacement: '[REDACTED_VERCEL_TOKEN]',
  },
  // GitHub PAT / OAuth: ghp_..., gho_..., ghu_..., ghs_..., ghr_...
  {
    regex: /gh[pousr]_[A-Za-z0-9_]{20,}/g,
    replacement: '[REDACTED_GITHUB_TOKEN]',
  },
  // Bearer Tokens in headers / strings
  {
    regex: /Bearer\s+[A-Za-z0-9_.-]{20,}/gi,
    replacement: 'Bearer [REDACTED_TOKEN]',
  },
  // JWT Tokens (header.payload.signature)
  {
    regex: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    replacement: '[REDACTED_JWT]',
  },
  // Postgres connection strings with passwords
  {
    regex: /postgres(?:ql)?:\/\/[^:]+:([^@]+)@/g,
    replacement: 'postgres://***:***@',
  },
  // Generic password assignments: password=xyz or "password": "xyz"
  {
    regex: /(password|secret|auth_secret|token)["']?\s*[:=]\s*["']([^"'\s]{4,})["']/gi,
    replacement: '$1="[REDACTED]"',
  },
]

/**
 * Redacts known secret patterns from any text, log message, or stack trace.
 */
export function redactSecrets(input: string): string {
  if (!input || typeof input !== 'string') return input

  let sanitized = input
  for (const { regex, replacement } of SECRET_PATTERNS) {
    sanitized = sanitized.replace(regex, replacement)
  }

  return sanitized
}

/**
 * Creates a safe error message for API responses in production, preventing credential leakage.
 */
export function formatSafeErrorMessage(err: unknown, fallback = 'An unexpected error occurred'): string {
  if (!err) return fallback

  const message = err instanceof Error ? err.message : String(err)
  const redacted = redactSecrets(message)

  // Avoid returning raw file paths or database connection internals
  if (redacted.includes('ECONNREFUSED') || redacted.includes('getaddrinfo')) {
    return 'Upstream service connection failure. Please verify network access.'
  }

  return redacted || fallback
}
