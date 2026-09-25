import { NextRequest, NextResponse } from 'next/server'

interface RateLimitConfig {
  /** Maximum allowed requests within the time window */
  maxRequests: number
  /** Window duration in seconds */
  windowSeconds: number
  /** Custom error message */
  message?: string
}

interface RateLimitRecord {
  timestamps: number[]
}

// In-memory sliding window store
const rateLimitStore = new Map<string, RateLimitRecord>()

// Periodic garbage collection every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, record] of rateLimitStore.entries()) {
    // Keep entries from last 15 minutes
    record.timestamps = record.timestamps.filter((t) => now - t < 15 * 60 * 1000)
    if (record.timestamps.length === 0) {
      rateLimitStore.delete(key)
    }
  }
}, 5 * 60 * 1000).unref?.()

/**
 * Pre-configured rate limits for different endpoint classes
 */
export const RATE_LIMIT_PROFILES: Record<string, RateLimitConfig> = {
  // Authentication: strict to protect against brute force / credential stuffing
  auth: {
    maxRequests: 15,
    windowSeconds: 60,
    message: 'Too many authentication attempts. Please wait a minute before trying again.',
  },
  // AI generation / LLM calls
  ai: {
    maxRequests: 60,
    windowSeconds: 60,
    message: 'AI request limit reached. Please wait a moment before sending another prompt.',
  },
  // Media generation / uploads
  media: {
    maxRequests: 30,
    windowSeconds: 60,
    message: 'Media creation rate limit exceeded. Please wait a moment.',
  },
  // Terminal / Sandbox execution
  terminal: {
    maxRequests: 40,
    windowSeconds: 60,
    message: 'Sandbox command rate limit exceeded. Please wait before executing further commands.',
  },
  // GitHub & Vercel deployment actions
  deploy: {
    maxRequests: 20,
    windowSeconds: 60,
    message: 'Deployment rate limit reached. Please wait before initiating another deployment.',
  },
  // General API requests
  general: {
    maxRequests: 180,
    windowSeconds: 60,
    message: 'Too many requests. Please slow down.',
  },
}

/**
 * Extracts client IP address safely
 */
export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0].trim()
    if (first) return first
  }
  const realIp = req.headers.get('x-real-ip')
  if (realIp) return realIp.trim()
  const cfConnectingIp = req.headers.get('cf-connecting-ip')
  if (cfConnectingIp) return cfConnectingIp.trim()

  return '127.0.0.1'
}

/**
 * Evaluates rate limit for a given key and profile.
 * Returns rate limit metadata.
 */
export function checkRateLimit(
  key: string,
  profileOrConfig: RateLimitConfig | keyof typeof RATE_LIMIT_PROFILES = 'general'
): {
  allowed: boolean
  remaining: number
  resetTime: number
  limit: number
  retryAfterSeconds: number
} {
  const config: RateLimitConfig =
    typeof profileOrConfig === 'string'
      ? RATE_LIMIT_PROFILES[profileOrConfig] || RATE_LIMIT_PROFILES.general
      : profileOrConfig

  const now = Date.now()
  const windowMs = config.windowSeconds * 1000

  let record = rateLimitStore.get(key)
  if (!record) {
    record = { timestamps: [] }
    rateLimitStore.set(key, record)
  }

  // Filter timestamps within current sliding window
  record.timestamps = record.timestamps.filter((t) => now - t < windowMs)

  const count = record.timestamps.length

  if (count >= config.maxRequests) {
    const oldest = record.timestamps[0] || now
    const resetTime = oldest + windowMs
    const retryAfterSeconds = Math.max(1, Math.ceil((resetTime - now) / 1000))

    return {
      allowed: false,
      remaining: 0,
      resetTime,
      limit: config.maxRequests,
      retryAfterSeconds,
    }
  }

  // Register this hit
  record.timestamps.push(now)
  const remaining = config.maxRequests - record.timestamps.length
  const resetTime = now + windowMs

  return {
    allowed: true,
    remaining: Math.max(0, remaining),
    resetTime,
    limit: config.maxRequests,
    retryAfterSeconds: 0,
  }
}

/**
 * Applies rate limiting to an incoming NextRequest.
 * Returns 429 response if rate exceeded, or null if allowed.
 */
export function enforceRateLimit(
  req: NextRequest,
  profile: keyof typeof RATE_LIMIT_PROFILES = 'general',
  customIdentifier?: string
): NextResponse | null {
  const ip = getClientIp(req)
  const key = customIdentifier ? `${profile}:${customIdentifier}` : `${profile}:${ip}`

  const result = checkRateLimit(key, profile)

  if (!result.allowed) {
    const config = RATE_LIMIT_PROFILES[profile] || RATE_LIMIT_PROFILES.general
    return NextResponse.json(
      {
        error: config.message || 'Too many requests. Please slow down.',
        retryAfter: result.retryAfterSeconds,
      },
      {
        status: 429,
        headers: {
          'Retry-After': result.retryAfterSeconds.toString(),
          'X-RateLimit-Limit': result.limit.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': Math.ceil(result.resetTime / 1000).toString(),
        },
      }
    )
  }

  return null
}
