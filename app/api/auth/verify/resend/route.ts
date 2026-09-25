export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import {
  getAuthenticatedUser,
  jsonError,
  jsonSuccess,
} from '@/lib/auth/server'
import {
  generateVerificationCode,
  hashVerificationCode,
  MAX_RESENDS_PER_HOUR,
  RESEND_COOLDOWN_MS,
  VERIFICATION_CODE_EXPIRY_MS,
} from '@/lib/auth/verification'
import { db } from '@/lib/db/store'
import { sendVerificationEmail } from '@/lib/email/brevo'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const email = body?.email

    // 1. Identify user
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
        message: 'Account is already verified.',
      })
    }

    // 3. Check existing code record for cooldown and rate limits
    const existing = await db.getVerificationCodeByUserId(user.id)
    const now = Date.now()

    if (existing && existing.last_resend_at) {
      const timeSinceLastResend = now - new Date(existing.last_resend_at).getTime()
      if (timeSinceLastResend < RESEND_COOLDOWN_MS) {
        const waitSeconds = Math.ceil((RESEND_COOLDOWN_MS - timeSinceLastResend) / 1000)
        return jsonError(
          `Please wait ${waitSeconds} second${waitSeconds === 1 ? '' : 's'} before requesting a new code.`,
          429,
          {
            errorCode: 'COOLDOWN_ACTIVE',
            cooldownSeconds: waitSeconds,
          }
        )
      }

      // Check max resends per hour limit
      if (existing.resend_count >= MAX_RESENDS_PER_HOUR) {
        const recordCreatedAt = new Date(existing.created_at).getTime()
        if (now - recordCreatedAt < 60 * 60 * 1000) {
          return jsonError(
            'Maximum resend limit reached for this hour. Please try again later or check your spam folder.',
            429,
            { errorCode: 'TOO_MANY_RESENDS' }
          )
        }
      }
    }

    // 4. Generate new secure 6-digit code & store hash
    const newCode = generateVerificationCode()
    const codeHash = hashVerificationCode(newCode, user.id)
    const expiresAt = new Date(now + VERIFICATION_CODE_EXPIRY_MS)

    await db.updateVerificationResend(user.id, codeHash, expiresAt)

    // 5. Send verification email via Brevo
    const emailResult = await sendVerificationEmail(
      user.email,
      user.display_name || user.email.split('@')[0],
      newCode
    )

    if (!emailResult.success) {
      console.error('[Verify Resend API] Failed to deliver email via Brevo:', emailResult.error)
      return jsonError('Failed to deliver verification email. Please try again later.', 502, {
        errorCode: 'EMAIL_DELIVERY_FAILURE',
      })
    }

    return jsonSuccess({
      success: true,
      message: `A new 6-digit verification code has been sent to ${user.email}.`,
      cooldownSeconds: 60,
    })
  } catch (err: unknown) {
    const error = err as Error
    console.error('[Verify Resend API] Error resending verification code:', error)
    return jsonError('Failed to resend verification code. Please try again.', 500)
  }
}
