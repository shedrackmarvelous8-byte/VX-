export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { jsonError, jsonSuccess, requireAuth, verifyProjectOwnership } from '@/lib/auth/server'
import { db } from '@/lib/db/store'

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

  return jsonSuccess({ project })
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const authResult = await requireAuth(req)
  if ('errorResponse' in authResult) return authResult.errorResponse

  const { id } = await context.params
  const project = await verifyProjectOwnership(authResult.user.id, id)

  if (!project) {
    return jsonError('Project not found or access denied', 404)
  }

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return jsonError('Invalid request body', 400)
    }

    const { name, description, stack } = body
    if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
      return jsonError('Project name cannot be empty', 400)
    }

    const updated = await db.updateProject(id, authResult.user.id, {
      name: typeof name === 'string' ? name : undefined,
      description: typeof description === 'string' ? description : undefined,
      stack: typeof stack === 'string' ? stack : undefined,
    })

    if (!updated) {
      return jsonError('Failed to update project or access denied', 404)
    }

    return jsonSuccess({ project: updated, message: 'Project updated successfully' })
  } catch (err: unknown) {
    const error = err as Error
    console.error('Error updating project:', error)
    return jsonError('Failed to update project', 500)
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const authResult = await requireAuth(req)
  if ('errorResponse' in authResult) return authResult.errorResponse

  const { id } = await context.params
  const project = await verifyProjectOwnership(authResult.user.id, id)

  if (!project) {
    return jsonError('Project not found or access denied', 404)
  }

  try {
    const deleted = await db.deleteProject(id, authResult.user.id)
    if (!deleted) {
      return jsonError('Failed to delete project or access denied', 404)
    }

    return jsonSuccess({ success: true, message: 'Project deleted successfully' })
  } catch (err: unknown) {
    const error = err as Error
    console.error('Error deleting project:', error)
    return jsonError('Failed to delete project', 500)
  }
}
