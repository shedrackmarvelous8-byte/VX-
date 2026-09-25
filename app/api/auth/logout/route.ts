export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { clearSessionCookie, getAuthTokenFromRequest, jsonSuccess } from '@/lib/auth/server'
import { db } from '@/lib/db/store'

export async function POST(req: NextRequest) {
  const token = getAuthTokenFromRequest(req)
  if (token) {
    try {
      await db.deleteSession(token)
    } catch (err) {
      console.warn('Error deleting session during logout:', err)
    }
  }

  const response = jsonSuccess({ success: true, message: 'Logged out successfully' })
  clearSessionCookie(response)
  return response
}
