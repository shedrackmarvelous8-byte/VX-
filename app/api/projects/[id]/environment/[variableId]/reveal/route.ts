export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { jsonError, jsonSuccess, requireAuth, verifyProjectOwnership } from '@/lib/auth/server'
import { revealProjectEnvVar } from '@/lib/env-vars/service'

interface RouteContext {
  params: Promise<{ id: string; variableId: string }>
}

export async function POST(req: NextRequest, context: RouteContext) {
  const authResult = await requireAuth(req)
  if ('errorResponse' in authResult) return authResult.errorResponse

  const { id, variableId } = await context.params
  const project = await verifyProjectOwnership(authResult.user.id, id)
  if (!project) return jsonError('Project not found or access denied', 404)

  try {
    const revealed = await revealProjectEnvVar({
      projectId: id,
      userId: authResult.user.id,
      variableId,
    })

    return jsonSuccess({ secret: revealed })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return jsonError(errorMsg, 400)
  }
}
