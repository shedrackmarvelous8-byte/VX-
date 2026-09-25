import crypto from 'crypto'

export const VERIFICATION_CODE_EXPIRY_MS = 15 * 60 * 1000 // 15 minutes
export const MAX_VERIFICATION_ATTEMPTS = 5
export const RESEND_COOLDOWN_MS = 60 * 1000 // 60 seconds
export const MAX_RESENDS_PER_HOUR = 5

function getHashSecret(): string {
  const secret = process.env.VERIFICATION_HASH_SECRET || process.env.SESSION_SECRET || process.env.ENCRYPTION_KEY
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('CRITICAL SECURITY ERROR: VERIFICATION_HASH_SECRET is required in production environment.')
    }
    return 'vx_dev_local_only_verification_hash_salt_2026'
  }
  return secret
}

/**
 * Generates a cryptographically secure 6-digit numeric verification code (100000 - 999999).
 */
export function generateVerificationCode(): string {
  // randomInt generates a cryptographically strong pseudo-random integer in [min, max)
  const code = crypto.randomInt(100000, 1000000)
  return code.toString()
}

/**
 * Creates a secure SHA-256 HMAC hash of the 6-digit code for database storage.
 * Codes are never stored plaintext.
 */
export function hashVerificationCode(code: string, userId: string): string {
  return crypto
    .createHmac('sha256', getHashSecret())
    .update(`${userId}:${code.trim()}`)
    .digest('hex')
}

/**
 * Performs a constant-time comparison of the submitted code against the stored hash.
 */
export function verifyCodeHash(inputCode: string, userId: string, storedHash: string): boolean {
  if (!inputCode || !storedHash) return false
  const inputHash = hashVerificationCode(inputCode, userId)
  try {
    return crypto.timingSafeEqual(Buffer.from(inputHash, 'hex'), Buffer.from(storedHash, 'hex'))
  } catch {
    return false
  }
}
