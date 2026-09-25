export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { generateSecureToken } from '@/lib/auth/tokens'
import {
  getAuthenticatedUser,
  jsonError,
  jsonSuccess,
  SESSION_DURATION_MS,
  setSessionCookie,
} from '@/lib/auth/server'
import {
  MAX_VERIFICATION_ATTEMPTS,
  verifyCodeHash,
} from '@/lib/auth/verification'
import { db } from '@/lib/db/store'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return jsonError('Invalid request payload', 400)
    }

    const { code, email } = body

    if (!code || typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) {
      return jsonError('Please enter a valid 6-digit verification code', 400, {
        errorCode: 'INVALID_FORMAT',
      })
    }

    const cleanCode = code.trim()

    // 1. Identify user: via active session or via provided email
    let user = await getAuthenticatedUser(req)
    if (!user && email && typeof email === 'string') {
      user = await db.findUserByEmail(email)
    }

    if (!user) {
      return jsonError('User account not found or unauthenticated', 401, {
        errorCode: 'UNAUTHENTICATED',
      })
    }

    // 2. If already verified
    if (user.email_verified) {
      return jsonSuccess({
        success: true,
        alreadyVerified: true,
        message: 'Account email is already verified.',
        user,
      })
    }

    // 3. Retrieve active verification record
    const record = await db.getVerificationCodeByUserId(user.id)
    if (!record) {
      return jsonError(
        'No active verification code found. Please request a new code.',
        400,
        { errorCode: 'CODE_NOT_FOUND' }
      )
    }

    // 4. Check if max attempts reached
    if (record.attempts >= MAX_VERIFICATION_ATTEMPTS) {
      return jsonError(
        'Maximum verification attempts exceeded. Please request a new code.',
        429,
        { errorCode: 'TOO_MANY_ATTEMPTS', maxAttempts: MAX_VERIFICATION_ATTEMPTS }
      )
    }

    // 5. Check if expired
    const now = new Date()
    const expiresAt = new Date(record.expires_at)
    if (expiresAt < now) {
      return jsonError(
        'Verification code has expired. Please request a new code.',
        400,
        { errorCode: 'CODE_EXPIRED' }
      )
    }

    // 6. Verify code hash
    const isValid = verifyCodeHash(cleanCode, user.id, record.code_hash)
    if (!isValid) {
      const attempts = await db.incrementVerificationAttempt(user.id)
      const remaining = Math.max(0, MAX_VERIFICATION_ATTEMPTS - attempts)

      if (remaining <= 0) {
        return jsonError(
          'Incorrect code. Maximum attempts exceeded. Please request a new code.',
          400,
          { errorCode: 'TOO_MANY_ATTEMPTS', remainingAttempts: 0 }
        )
      }

      return jsonError(
        `Incorrect verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
        400,
        { errorCode: 'INVALID_CODE', remainingAttempts: remaining }
      )
    }

    // 7. Successful verification: Invalidate code and mark profile verified
    await db.deleteVerificationCodes(user.id)
    const verifiedUser = await db.markEmailVerified(user.id)

    // Create fresh session and set session cookie
    const token = generateSecureToken(32)
    const sessionExpiresAt = new Date(Date.now() + SESSION_DURATION_MS)
    const session = await db.createSession(user.id, token, sessionExpiresAt)

    const finalUser = verifiedUser || { ...user, email_verified: true }
    const response = jsonSuccess({
      success: true,
      message: 'Email verified successfully. Welcome to VX!',
      user: finalUser,
      session: {
        token: session.token,
        expires_at: session.expires_at,
      },
    })

    setSessionCookie(response, session.token, sessionExpiresAt)
    return response
  } catch (err: unknown) {
    const error = err as Error
    console.error('[Verify API] Error during code verification:', error)
    return jsonError('Failed to verify code. Please try again.', 500)
  }
}
