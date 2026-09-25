export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { hashPassword, validateEmail, validatePassword } from '@/lib/auth/password'
import { generateSecureToken } from '@/lib/auth/tokens'
import {
  generateVerificationCode,
  hashVerificationCode,
  VERIFICATION_CODE_EXPIRY_MS,
} from '@/lib/auth/verification'
import { jsonError, jsonSuccess, SESSION_DURATION_MS, setSessionCookie } from '@/lib/auth/server'
import { db } from '@/lib/db/store'
import { sendVerificationEmail } from '@/lib/email/brevo'
import { enforceRateLimit, getClientIp } from '@/lib/security/rate-limit'
import { logSecurityEvent } from '@/lib/security/audit'
import { sanitizeString } from '@/lib/security/validation'
import { formatSafeErrorMessage } from '@/lib/security/redact'

export async function POST(req: NextRequest) {
  try {
    // 1. Strict rate limit on account registration
    const rateLimitResponse = enforceRateLimit(req, 'auth')
    if (rateLimitResponse) {
      logSecurityEvent('AUTH_RATE_LIMIT', {
        ip: getClientIp(req),
        details: { action: 'signup' },
      })
      return rateLimitResponse
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return jsonError('Invalid request body', 400)
    }

    const { email, password, displayName } = body

    // Validate email
    const emailValidation = validateEmail(email)
    if (!emailValidation.valid) {
      return jsonError(emailValidation.message || 'Invalid email', 400)
    }

    // Validate password
    const passwordValidation = validatePassword(password)
    if (!passwordValidation.valid) {
      return jsonError(passwordValidation.message || 'Invalid password', 400)
    }

    // Check if user already exists
    const existing = await db.findUserByEmail(email)
    if (existing) {
      return jsonError('An account with this email already exists', 409)
    }

    // Hash password with bcrypt
    const passwordHash = await hashPassword(password)

    // Create user profile (unverified by default)
    const sanitizedName = displayName ? sanitizeString(displayName, 80) : undefined
    const { profile } = await db.createUser({
      email,
      passwordHash,
      displayName: sanitizedName,
      emailVerified: false,
    })

    // Generate secure 6-digit verification code and store hash
    const verificationCode = generateVerificationCode()
    const codeHash = hashVerificationCode(verificationCode, profile.id)
    const verificationExpiresAt = new Date(Date.now() + VERIFICATION_CODE_EXPIRY_MS)

    await db.createVerificationCode(profile.id, codeHash, verificationExpiresAt)

    // Send verification email via Brevo transactional email API
    const recipientName = profile.display_name || profile.email.split('@')[0]
    const emailResult = await sendVerificationEmail(profile.email, recipientName, verificationCode)

    // Create initial session token for the newly signed up user
    const token = generateSecureToken(32)
    const sessionExpiresAt = new Date(Date.now() + SESSION_DURATION_MS)
    const session = await db.createSession(profile.id, token, sessionExpiresAt)

    const response = jsonSuccess(
      {
        user: profile,
        session: {
          token: session.token,
          expires_at: session.expires_at,
        },
        message: 'Account created successfully. Please check your email to verify your address.',
        emailDelivered: emailResult.success,
      },
      201
    )

    // Set httpOnly session cookie
    setSessionCookie(response, session.token, sessionExpiresAt)

    return response
  } catch (err: unknown) {
    return jsonError(formatSafeErrorMessage(err, 'Signup failed'), 500)
  }
}
