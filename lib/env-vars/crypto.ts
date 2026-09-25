import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'

function getEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY || process.env.VERIFICATION_HASH_SECRET

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('CRITICAL SECURITY ERROR: ENCRYPTION_KEY or VERIFICATION_HASH_SECRET is required in production environment.')
    }
    // Strict development-only fallback key
    return crypto.createHash('sha256').update('vx_dev_local_only_encryption_key_2026').digest()
  }

  return crypto.createHash('sha256').update(secret).digest()
}

/**
 * Encrypts sensitive string using AES-256-GCM.
 * Output format: iv:authTag:ciphertext
 */
export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag().toString('hex')

  return `${iv.toString('hex')}:${authTag}:${encrypted}`
}

/**
 * Decrypts string encrypted with AES-256-GCM.
 */
export function decryptSecret(encryptedPayload: string): string {
  try {
    const parts = encryptedPayload.split(':')
    if (parts.length !== 3) {
      // Fallback if plaintext or different format
      return encryptedPayload
    }

    const [ivHex, authTagHex, encryptedHex] = parts
    const key = getEncryptionKey()
    const iv = Buffer.from(ivHex, 'hex')
    const authTag = Buffer.from(authTagHex, 'hex')

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (err: unknown) {
    console.error('Decryption failed, falling back:', err)
    return '••••••••'
  }
}

export function maskSecretValue(value: string): string {
  if (!value) return ''
  if (value.length <= 4) return '••••'
  return '••••••••'
}
