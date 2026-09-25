export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import {
  getAuthenticatedUser,
  jsonError,
  jsonSuccess,
} from '@/lib/auth/server'
import { db } from '@/lib/db/store'

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req)
    if (!user) {
      return jsonError('Unauthorized', 401)
    }

    const verificationRecord = user.email_verified
      ? null
      : await db.getVerificationCodeByUserId(user.id)

    return jsonSuccess({
      email: user.email,
      verified: Boolean(user.email_verified),
      hasActiveCode: Boolean(
        verificationRecord && new Date(verificationRecord.expires_at) > new Date()
      ),
      expiresAt: verificationRecord ? verificationRecord.expires_at : null,
    })
  } catch (err: unknown) {
    const error = err as Error
    console.error('[Verify Status API] Error checking status:', error)
    return jsonError('Failed to check verification status', 500)
  }
}
