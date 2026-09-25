export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { jsonError, jsonSuccess, requireAuth, verifyProjectOwnership } from '@/lib/auth/server'
import { executeControlledQuery } from '@/lib/project-db/service'
import { recordUsageEvent } from '@/lib/usage/tracker'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(req: NextRequest, context: RouteContext) {
  const authResult = await requireAuth(req)
  if ('errorResponse' in authResult) return authResult.errorResponse

  const { id } = await context.params
  const project = await verifyProjectOwnership(authResult.user.id, id)
  if (!project) return jsonError('Project not found or access denied', 404)

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body.sql !== 'string') {
      return jsonError('sql string is required', 400)
    }

    const result = await executeControlledQuery({
      projectId: id,
      userId: authResult.user.id,
      sql: body.sql,
    })

    await recordUsageEvent({
      projectId: id,
      userId: authResult.user.id,
      type: 'database_query',
      quantity: 1,
      durationMs: result.durationMs,
      metadata: { rowCount: result.rowCount },
    })

    return jsonSuccess({ result })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return jsonError(errorMsg, 400)
  }
}
