export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { jsonError, jsonSuccess, requireAuth, verifyProjectOwnership } from '@/lib/auth/server'
import { getProjectDatabase } from '@/lib/project-db/service'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(req: NextRequest, context: RouteContext) {
  const authResult = await requireAuth(req)
  if ('errorResponse' in authResult) return authResult.errorResponse

  const { id } = await context.params
  const project = await verifyProjectOwnership(authResult.user.id, id)
  if (!project) {
    return jsonError('Project not found or access denied', 404)
  }

  try {
    const database = await getProjectDatabase(id)
    return jsonSuccess({ database })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return jsonError(`Failed to fetch database: ${errorMsg}`, 500)
  }
}
