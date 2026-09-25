export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { jsonSuccess, requireAuth } from '@/lib/auth/server'
import { getBillingStatus, getUserSubscription } from '@/lib/billing/provider'

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req)
  if ('errorResponse' in authResult) return authResult.errorResponse

  const status = getBillingStatus()
  const subscription = await getUserSubscription(authResult.user.id)

  return jsonSuccess({
    status,
    subscription,
  })
}
