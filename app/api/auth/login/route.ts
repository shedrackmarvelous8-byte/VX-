export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { validateEmail, verifyPassword } from '@/lib/auth/password'
import { generateSecureToken } from '@/lib/auth/tokens'
import { jsonError, jsonSuccess, SESSION_DURATION_MS, setSessionCookie } from '@/lib/auth/server'
import { db } from '@/lib/db/store'
import { enforceRateLimit, getClientIp } from '@/lib/security/rate-limit'
import { logSecurityEvent } from '@/lib/security/audit'
import { formatSafeErrorMessage } from '@/lib/security/redact'

export async function POST(req: NextRequest) {
  try {
    // 1. Enforce strict rate limit on login attempts
    const rateLimitResponse = enforceRateLimit(req, 'auth')
    if (rateLimitResponse) {
      logSecurityEvent('AUTH_RATE_LIMIT', {
        ip: getClientIp(req),
        details: { action: 'login' },
      })
      return rateLimitResponse
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return jsonError('Invalid request body', 400)
    }

    const { email, password } = body

    if (!email || !password) {
      return jsonError('Email and password are required', 400)
    }

    const emailValidation = validateEmail(email)
    if (!emailValidation.valid) {
      return jsonError('Please enter a valid email address', 400)
    }

    // Find user by email
    const user = await db.findUserByEmail(email)
    if (!user) {
      logSecurityEvent('AUTH_FAILED', {
        ip: getClientIp(req),
        details: { reason: 'User not found' },
      })
      return jsonError('Invalid email or password', 401)
    }

    // Find password credential
    const credential = await db.getPasswordCredential(user.id)
    if (!credential) {
      logSecurityEvent('AUTH_FAILED', {
        ip: getClientIp(req),
        userId: user.id,
        details: { reason: 'Missing credentials' },
      })
      return jsonError('Invalid email or password', 401)
    }

    // Verify bcrypt hash
    const isValid = await verifyPassword(password, credential.password_hash)
    if (!isValid) {
      logSecurityEvent('AUTH_FAILED', {
        ip: getClientIp(req),
        userId: user.id,
        details: { reason: 'Incorrect password' },
      })
      return jsonError('Invalid email or password', 401)
    }

    // Create session token
    const token = generateSecureToken(32)
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)
    const session = await db.createSession(user.id, token, expiresAt)

    const response = jsonSuccess({
      user,
      session: {
        token: session.token,
        expires_at: session.expires_at,
      },
      message: 'Logged in successfully',
    })

    // Set httpOnly session cookie
    setSessionCookie(response, session.token, expiresAt)

    return response
  } catch (err: unknown) {
    return jsonError(formatSafeErrorMessage(err, 'Login failed'), 500)
  }
}
