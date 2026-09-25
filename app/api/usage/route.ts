export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { jsonSuccess, requireAuth } from '@/lib/auth/server'
import { db } from '@/lib/db/store'

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req)
  if ('errorResponse' in authResult) return authResult.errorResponse

  const { searchParams } = new URL(req.url)
  const limitParam = searchParams.get('limit')
  const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10) || 50), 100) : 50

  const usageLogs = await db.listAiUsageByUser(authResult.user.id, limit)

  const summary = usageLogs.reduce(
    (acc, log) => {
      acc.totalRequests += 1
      acc.totalTokens += log.total_tokens || 0
      acc.byProvider[log.provider] = (acc.byProvider[log.provider] || 0) + (log.total_tokens || 0)
      acc.byModel[log.model_id] = (acc.byModel[log.model_id] || 0) + 1
      return acc
    },
    {
      totalRequests: 0,
      totalTokens: 0,
      byProvider: {} as Record<string, number>,
      byModel: {} as Record<string, number>,
    }
  )

  return jsonSuccess({
    summary,
    logs: usageLogs,
  })
}
