export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { jsonError, jsonSuccess, requireAuth, verifyProjectOwnership } from '@/lib/auth/server'
import { deleteTableRow, updateTableRow } from '@/lib/project-db/service'
import { recordUsageEvent } from '@/lib/usage/tracker'

interface RouteContext {
  params: Promise<{ id: string; table: string; rowId: string }>
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const authResult = await requireAuth(req)
  if ('errorResponse' in authResult) return authResult.errorResponse

  const { id, table, rowId } = await context.params
  const project = await verifyProjectOwnership(authResult.user.id, id)
  if (!project) return jsonError('Project not found or access denied', 404)

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body.updates !== 'object') {
      return jsonError('updates object is required', 400)
    }

    const updated = await updateTableRow({
      projectId: id,
      userId: authResult.user.id,
      tableName: table,
      rowId,
      updates: body.updates,
    })

    await recordUsageEvent({
      projectId: id,
      userId: authResult.user.id,
      type: 'database_query',
      quantity: 1,
      metadata: { action: 'update_row', table, rowId },
    })

    return jsonSuccess({ row: updated })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return jsonError(errorMsg, 400)
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const authResult = await requireAuth(req)
  if ('errorResponse' in authResult) return authResult.errorResponse

  const { id, table, rowId } = await context.params
  const project = await verifyProjectOwnership(authResult.user.id, id)
  if (!project) return jsonError('Project not found or access denied', 404)

  try {
    const result = await deleteTableRow({
      projectId: id,
      userId: authResult.user.id,
      tableName: table,
      rowId,
    })

    await recordUsageEvent({
      projectId: id,
      userId: authResult.user.id,
      type: 'database_query',
      quantity: 1,
      metadata: { action: 'delete_row', table, rowId },
    })

    return jsonSuccess(result)
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return jsonError(errorMsg, 400)
  }
}
