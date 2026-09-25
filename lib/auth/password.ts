import bcrypt from 'bcryptjs'

const BCRYPT_SALT_ROUNDS = 10

/**
 * Hashes a plaintext password using bcrypt with salt rounds.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS)
}

/**
 * Compares a plaintext password against a stored bcrypt hash.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

/**
 * Validates password strength (minimum 8 characters).
 */
export function validatePassword(password: string): { valid: boolean; message?: string } {
  if (!password || typeof password !== 'string') {
    return { valid: false, message: 'Password is required' }
  }
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long' }
  }
  if (password.length > 128) {
    return { valid: false, message: 'Password cannot exceed 128 characters' }
  }
  return { valid: true }
}

/**
 * Validates email format.
 */
export function validateEmail(email: string): { valid: boolean; message?: string } {
  if (!email || typeof email !== 'string') {
    return { valid: false, message: 'Email is required' }
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email.trim())) {
    return { valid: false, message: 'Please enter a valid email address' }
  }
  return { valid: true }
}
