export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getAuthenticatedUser, jsonError, jsonSuccess } from '@/lib/auth/server'

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req)
    if (!user) {
      return jsonError('Unauthorized: No active session found', 401)
    }

    return jsonSuccess({
      user,
      authenticated: true,
    })
  } catch (err: unknown) {
    const error = err as Error
    console.error('Error in /api/auth/me:', error)
    return jsonError('Failed to fetch user session', 500)
  }
}
