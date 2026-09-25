export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { jsonError, jsonSuccess, requireAuth, verifyProjectOwnership } from '@/lib/auth/server'
import { getTableRows, insertTableRow } from '@/lib/project-db/service'
import { recordUsageEvent } from '@/lib/usage/tracker'

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
    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10)
    const search = searchParams.get('search') || undefined
    const sortBy = searchParams.get('sortBy') || undefined
    const sortOrder = (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc'

    const result = await getTableRows({
      projectId: id,
      tableName: table,
      page,
      pageSize,
      search,
      sortBy,
      sortOrder,
    })

    return jsonSuccess(result)
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return jsonError(errorMsg, 400)
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
    if (!body || typeof body.row !== 'object') {
      return jsonError('row object is required', 400)
    }

    const row = await insertTableRow({
      projectId: id,
      userId: authResult.user.id,
      tableName: table,
      row: body.row,
    })

    await recordUsageEvent({
      projectId: id,
      userId: authResult.user.id,
      type: 'database_query',
      quantity: 1,
      metadata: { action: 'insert_row', table },
    })

    return jsonSuccess({ row }, 201)
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return jsonError(errorMsg, 400)
  }
}
