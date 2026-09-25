export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { validateEmail } from '@/lib/auth/password'
import { generateSecureToken } from '@/lib/auth/tokens'
import { jsonError, jsonSuccess } from '@/lib/auth/server'
import { db } from '@/lib/db/store'
import { sendPasswordResetEmail } from '@/lib/email/brevo'

const RESET_TOKEN_DURATION_MS = 60 * 60 * 1000 // 1 hour

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return jsonError('Invalid request body', 400)
    }

    const { email } = body
    const emailValidation = validateEmail(email)
    if (!emailValidation.valid) {
      return jsonError('Please enter a valid email address', 400)
    }

    const user = await db.findUserByEmail(email)
    if (!user) {
      // Return success response even if user does not exist to prevent email enumeration attacks
      return jsonSuccess({
        success: true,
        message: 'If an account exists with this email, password reset instructions have been sent.',
      })
    }

    const token = generateSecureToken(32)
    const expiresAt = new Date(Date.now() + RESET_TOKEN_DURATION_MS)
    await db.createResetToken(user.id, token, expiresAt)

    // Send Password Reset email via Brevo
    const emailResult = await sendPasswordResetEmail(
      user.email,
      user.display_name || user.email.split('@')[0],
      token
    )

    if (!emailResult.success) {
      console.warn('[Reset Password] Brevo email delivery failed:', emailResult.error)
    }

    return jsonSuccess({
      success: true,
      message: 'If an account exists with this email, password reset instructions have been sent.',
    })
  } catch (err: unknown) {
    const error = err as Error
    console.error('Error in reset password request:', error)
    return jsonError('Failed to process password reset request', 500)
  }
}
