const PLATFORM_PATTERNS = [
  /(?:postgres(?:ql)?:\/\/[^\s:@]+:)([^\s@]+)(?:@[^\s]+)/gi,
  /(?:sk_live_|sk_test_|ghp_|gho_|xoxb-|xoxp-|AIzaSy)[a-zA-Z0-9_-]{16,}/g,
  /(?:Bearer\s+)[a-zA-Z0-9_.-]{20,}/gi,
]

export function redactSecrets(
  text: string,
  projectSecretValues: string[] = []
): string {
  if (!text || typeof text !== 'string') return ''

  let result = text

  // 1. Redact platform sensitive patterns
  result = result.replace(
    PLATFORM_PATTERNS[0],
    (match, password) => match.replace(password, '••••••••')
  )

  for (let i = 1; i < PLATFORM_PATTERNS.length; i++) {
    result = result.replace(PLATFORM_PATTERNS[i], '[REDACTED]')
  }

  // 2. Redact project-specific secret values
  for (const secret of projectSecretValues) {
    if (secret && secret.length >= 4) {
      result = result.split(secret).join('[REDACTED]')
    }
  }

  // 3. Redact environment platform keys if accidentally printed
  const sensitiveEnvKeys = [
    process.env.GEMINI_API_KEY,
    process.env.OPENROUTER_API_KEY,
    process.env.SUPABASE_SECRET_KEY,
    process.env.BREVO_API_KEY,
    process.env.VERCEL_TOKEN,
  ].filter(Boolean) as string[]

  for (const key of sensitiveEnvKeys) {
    if (key && key.length >= 6) {
      result = result.split(key).join('[PLATFORM_REDACTED]')
    }
  }

  return result
}
