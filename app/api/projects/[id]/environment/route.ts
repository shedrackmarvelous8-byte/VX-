export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { jsonError, jsonSuccess, requireAuth, verifyProjectOwnership } from '@/lib/auth/server'
import {
  createProjectEnvVar,
  listProjectEnvVars,
} from '@/lib/env-vars/service'

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
    const variables = await listProjectEnvVars(id)
    return jsonSuccess({ variables })
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
    if (!body || typeof body.key !== 'string' || typeof body.value !== 'string') {
      return jsonError('key and value are required strings', 400)
    }

    const created = await createProjectEnvVar({
      projectId: id,
      userId: authResult.user.id,
      key: body.key,
      value: body.value,
      isSecret: Boolean(body.isSecret),
      scope: body.scope || 'all',
    })

    return jsonSuccess({ variable: created }, 201)
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return jsonError(errorMsg, 400)
  }
}
