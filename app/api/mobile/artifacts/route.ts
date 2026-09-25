export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { jsonError, jsonSuccess, requireAuth, verifyProjectOwnership } from '@/lib/auth/server'
import { db } from '@/lib/db/store'

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req)
  if ('errorResponse' in authResult) return authResult.errorResponse

  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')

  if (!projectId) {
    return jsonError('projectId query parameter is required', 400)
  }

  const project = await verifyProjectOwnership(authResult.user.id, projectId)
  if (!project) {
    return jsonError('Project not found or access denied', 404)
  }

  const artifacts = await db.listProjectArtifacts(projectId, authResult.user.id)
  return jsonSuccess({ artifacts })
}
