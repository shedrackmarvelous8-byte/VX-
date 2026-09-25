export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { jsonError, jsonSuccess, requireAuth, verifyProjectOwnership } from '@/lib/auth/server'
import {
  createProjectTable,
  deleteProjectTable,
  listProjectTables,
} from '@/lib/project-db/service'
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
    const tables = await listProjectTables(id)
    return jsonSuccess({ tables })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return jsonError(`Failed to list tables: ${errorMsg}`, 500)
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
    if (!body || typeof body.tableName !== 'string') {
      return jsonError('tableName is required', 400)
    }

    const columns = Array.isArray(body.columns) ? body.columns : []
    const table = await createProjectTable({
      projectId: id,
      userId: authResult.user.id,
      tableName: body.tableName,
      columns,
    })

    await recordUsageEvent({
      projectId: id,
      userId: authResult.user.id,
      type: 'database_query',
      quantity: 1,
      metadata: { action: 'create_table', tableName: body.tableName },
    })

    return jsonSuccess({ table }, 201)
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return jsonError(errorMsg, 400)
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const authResult = await requireAuth(req)
  if ('errorResponse' in authResult) return authResult.errorResponse

  const { id } = await context.params
  const project = await verifyProjectOwnership(authResult.user.id, id)
  if (!project) return jsonError('Project not found or access denied', 404)

  try {
    const { searchParams } = new URL(req.url)
    const tableName = searchParams.get('tableName')
    if (!tableName) return jsonError('tableName query parameter is required', 400)

    const result = await deleteProjectTable({
      projectId: id,
      userId: authResult.user.id,
      tableName,
    })

    return jsonSuccess(result)
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return jsonError(errorMsg, 400)
  }
}
