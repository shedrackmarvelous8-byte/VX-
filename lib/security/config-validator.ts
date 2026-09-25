export interface ConfigStatus {
  key: string
  configured: boolean
  required: boolean
  purpose: string
}

export interface SystemValidationResult {
  valid: boolean
  environment: string
  timestamp: string
  items: ConfigStatus[]
  warnings: string[]
  errors: string[]
}

/**
 * Validates production environment variables without ever printing secret values.
 */
export function validateProductionConfig(): SystemValidationResult {
  const env = process.env.NODE_ENV || 'development'
  const items: ConfigStatus[] = []
  const warnings: string[] = []
  const errors: string[] = []

  // Check configs
  const checks = [
    {
      key: 'AUTH_SECRET',
      required: true,
      purpose: 'Session encryption and cookie signing',
      val: process.env.AUTH_SECRET,
    },
    {
      key: 'VERIFICATION_HASH_SECRET',
      required: true,
      purpose: 'Email verification code HMAC hashing',
      val: process.env.VERIFICATION_HASH_SECRET,
    },
    {
      key: 'GEMINI_API_KEY',
      required: false,
      purpose: 'Server-side Gemini AI generation and Work Intelligence',
      val: process.env.GEMINI_API_KEY,
    },
    {
      key: 'OPENROUTER_API_KEY',
      required: false,
      purpose: 'OpenRouter dynamic multi-model access',
      val: process.env.OPENROUTER_API_KEY,
    },
    {
      key: 'NEXT_PUBLIC_SUPABASE_URL',
      required: false,
      purpose: 'Supabase client storage and database connection',
      val: process.env.NEXT_PUBLIC_SUPABASE_URL,
    },
    {
      key: 'SUPABASE_SERVICE_ROLE_KEY',
      required: false,
      purpose: 'Supabase server-side storage and administration',
      val: process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
    {
      key: 'VERCEL_TOKEN',
      required: false,
      purpose: 'Production Vercel deployment integration',
      val: process.env.VERCEL_TOKEN,
    },
    {
      key: 'GITHUB_CLIENT_ID',
      required: false,
      purpose: 'GitHub OAuth repository integration',
      val: process.env.GITHUB_CLIENT_ID,
    },
  ]

  for (const c of checks) {
    const isConfigured = Boolean(c.val && c.val.trim().length > 0)
    items.push({
      key: c.key,
      configured: isConfigured,
      required: c.required,
      purpose: c.purpose,
    })

    if (c.required && !isConfigured) {
      errors.push(`Required configuration missing: ${c.key} (${c.purpose})`)
    } else if (!c.required && !isConfigured) {
      warnings.push(`Optional feature unconfigured: ${c.key} (${c.purpose})`)
    }
  }

  return {
    valid: errors.length === 0,
    environment: env,
    timestamp: new Date().toISOString(),
    items,
    warnings,
    errors,
  }
}
