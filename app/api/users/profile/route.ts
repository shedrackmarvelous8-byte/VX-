export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { jsonError, jsonSuccess, requireAuth } from '@/lib/auth/server'
import { db } from '@/lib/db/store'

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req)
  if ('errorResponse' in authResult) return authResult.errorResponse

  return jsonSuccess({
    user: authResult.user,
  })
}

export async function PATCH(req: NextRequest) {
  const authResult = await requireAuth(req)
  if ('errorResponse' in authResult) return authResult.errorResponse

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return jsonError('Invalid request body', 400)
    }

    const { displayName, avatarUrl } = body
    const updated = await db.updateUserProfile(authResult.user.id, {
      displayName: typeof displayName === 'string' ? displayName : undefined,
      avatarUrl: typeof avatarUrl === 'string' ? avatarUrl : undefined,
    })

    if (!updated) {
      return jsonError('User profile not found', 404)
    }

    return jsonSuccess({
      user: updated,
      message: 'Profile updated successfully',
    })
  } catch (err: unknown) {
    const error = err as Error
    console.error('Error in PATCH /api/users/profile:', error)
    return jsonError('Failed to update profile', 500)
  }
}
