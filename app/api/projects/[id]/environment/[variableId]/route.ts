export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { jsonError, jsonSuccess, requireAuth, verifyProjectOwnership } from '@/lib/auth/server'
import {
  deleteProjectEnvVar,
  updateProjectEnvVar,
} from '@/lib/env-vars/service'

interface RouteContext {
  params: Promise<{ id: string; variableId: string }>
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const authResult = await requireAuth(req)
  if ('errorResponse' in authResult) return authResult.errorResponse

  const { id, variableId } = await context.params
  const project = await verifyProjectOwnership(authResult.user.id, id)
  if (!project) return jsonError('Project not found or access denied', 404)

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return jsonError('Invalid request body', 400)
    }

    const updated = await updateProjectEnvVar({
      projectId: id,
      userId: authResult.user.id,
      variableId,
      value: body.value,
      isSecret: body.isSecret,
      scope: body.scope,
    })

    return jsonSuccess({ variable: updated })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return jsonError(errorMsg, 400)
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const authResult = await requireAuth(req)
  if ('errorResponse' in authResult) return authResult.errorResponse

  const { id, variableId } = await context.params
  const project = await verifyProjectOwnership(authResult.user.id, id)
  if (!project) return jsonError('Project not found or access denied', 404)

  try {
    const result = await deleteProjectEnvVar({
      projectId: id,
      userId: authResult.user.id,
      variableId,
    })

    return jsonSuccess(result)
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return jsonError(errorMsg, 400)
  }
}
