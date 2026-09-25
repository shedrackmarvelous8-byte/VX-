export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { jsonError, jsonSuccess, requireAuth, verifyProjectOwnership } from '@/lib/auth/server'
import { applyProjectMigration, listProjectMigrations } from '@/lib/project-db/service'
import { recordUsageEvent } from '@/lib/usage/tracker'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(req: NextRequest, context: RouteContext) {
  const authResult = await requireAuth(req)
  if ('errorResponse' in authResult) return authResult.errorResponse

  const { id } = await context.params
  const project = await verifyProjectOwnership(authResult.user.id, id)
  if (!project) return jsonError('Project not found or access denied', 404)

  try {
    const migrations = await listProjectMigrations(id)
    return jsonSuccess({ migrations })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return jsonError(errorMsg, 500)
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  const authResult = await requireAuth(req)
  if ('errorResponse' in authResult) return authResult.errorResponse

  const { id } = await context.params
  const project = await verifyProjectOwnership(authResult.user.id, id)
  if (!project) return jsonError('Project not found or access denied', 404)

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body.name !== 'string' || typeof body.upSql !== 'string') {
      return jsonError('name and upSql are required', 400)
    }

    const migration = await applyProjectMigration({
      projectId: id,
      userId: authResult.user.id,
      name: body.name,
      upSql: body.upSql,
      downSql: body.downSql,
      description: body.description,
    })

    await recordUsageEvent({
      projectId: id,
      userId: authResult.user.id,
      type: 'database_query',
      quantity: 1,
      metadata: { action: 'migration', name: body.name },
    })

    return jsonSuccess({ migration }, 201)
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return jsonError(errorMsg, 400)
  }
}
