export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { hashPassword, validatePassword } from '@/lib/auth/password'
import { jsonError, jsonSuccess } from '@/lib/auth/server'
import { db } from '@/lib/db/store'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return jsonError('Invalid request body', 400)
    }

    const { token, newPassword } = body
    if (!token || typeof token !== 'string') {
      return jsonError('Reset token is required', 400)
    }

    const passwordValidation = validatePassword(newPassword)
    if (!passwordValidation.valid) {
      return jsonError(passwordValidation.message || 'Invalid password', 400)
    }

    // Verify reset token
    const resetRecord = await db.getResetToken(token.trim())
    if (!resetRecord) {
      return jsonError('Invalid or expired password reset token', 400)
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword)

    // Update password and invalidate reset token & existing sessions
    await db.updatePassword(resetRecord.user_id, newPasswordHash)
    await db.deleteResetToken(token.trim())

    return jsonSuccess({
      success: true,
      message: 'Password has been reset successfully. Please log in with your new password.',
    })
  } catch (err: unknown) {
    const error = err as Error
    console.error('Error in reset password confirm:', error)
    return jsonError('Failed to reset password', 500)
  }
}
