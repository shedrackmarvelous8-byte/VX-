import crypto from 'crypto'

/**
 * Generates a cryptographically secure random hexadecimal token.
 * Default 32 bytes (256 bits).
 */
export function generateSecureToken(byteLength = 32): string {
  return crypto.randomBytes(byteLength).toString('hex')
}

/**
 * Generates a UUID v4 string.
 */
export function generateUuid(): string {
  return crypto.randomUUID()
}
