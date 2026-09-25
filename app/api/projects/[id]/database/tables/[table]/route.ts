export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { jsonError, jsonSuccess, requireAuth, verifyProjectOwnership } from '@/lib/auth/server'
import {
  addTableColumn,
  deleteTableColumn,
  getTableSchema,
} from '@/lib/project-db/service'

interface RouteContext {
  params: Promise<{ id: string; table: string }>
}

export async function GET(req: NextRequest, context: RouteContext) {
  const authResult = await requireAuth(req)
  if ('errorResponse' in authResult) return authResult.errorResponse

  const { id, table } = await context.params
  const project = await verifyProjectOwnership(authResult.user.id, id)
  if (!project) return jsonError('Project not found or access denied', 404)

  try {
    const tableMeta = await getTableSchema(id, table)
    if (!tableMeta) return jsonError(`Table "${table}" not found`, 404)
    return jsonSuccess({ table: tableMeta })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return jsonError(errorMsg, 500)
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  const authResult = await requireAuth(req)
  if ('errorResponse' in authResult) return authResult.errorResponse

  const { id, table } = await context.params
  const project = await verifyProjectOwnership(authResult.user.id, id)
  if (!project) return jsonError('Project not found or access denied', 404)

  try {
    const body = await req.json().catch(() => null)
    if (!body || !body.column || typeof body.column.name !== 'string') {
      return jsonError('column specification with name is required', 400)
    }

    const updatedTable = await addTableColumn({
      projectId: id,
      userId: authResult.user.id,
      tableName: table,
      column: body.column,
    })

    return jsonSuccess({ table: updatedTable })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return jsonError(errorMsg, 400)
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const authResult = await requireAuth(req)
  if ('errorResponse' in authResult) return authResult.errorResponse

  const { id, table } = await context.params
  const project = await verifyProjectOwnership(authResult.user.id, id)
  if (!project) return jsonError('Project not found or access denied', 404)

  try {
    const { searchParams } = new URL(req.url)
    const columnName = searchParams.get('columnName')
    if (!columnName) return jsonError('columnName query parameter is required', 400)

    const updatedTable = await deleteTableColumn({
      projectId: id,
      userId: authResult.user.id,
      tableName: table,
      columnName,
    })

    return jsonSuccess({ table: updatedTable })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return jsonError(errorMsg, 400)
  }
}
