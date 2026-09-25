export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { jsonError, jsonSuccess, requireAuth } from '@/lib/auth/server'
import { db } from '@/lib/db/store'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(req: NextRequest, context: RouteContext) {
  const authResult = await requireAuth(req)
  if ('errorResponse' in authResult) return authResult.errorResponse

  const { id } = await context.params
  const convo = await db.findConversationById(id)

  if (!convo || convo.user_id !== authResult.user.id) {
    return jsonError('Conversation not found or access denied', 404)
  }

  return jsonSuccess({ conversation: convo })
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const authResult = await requireAuth(req)
  if ('errorResponse' in authResult) return authResult.errorResponse

  const { id } = await context.params
  const convo = await db.findConversationById(id)

  if (!convo || convo.user_id !== authResult.user.id) {
    return jsonError('Conversation not found or access denied', 404)
  }

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return jsonError('Invalid request body', 400)
    }

    const { title, pinned, archived, projectId } = body

    if (title !== undefined && (typeof title !== 'string' || !title.trim())) {
      return jsonError('Title cannot be empty', 400)
    }

    if (projectId !== undefined) {
      if (typeof projectId !== 'string') {
        return jsonError('Invalid target project ID', 400)
      }
      const targetProject = await db.findProjectById(projectId)
      if (!targetProject || targetProject.user_id !== authResult.user.id) {
        return jsonError('Destination project not found or access denied', 404)
      }
    }

    const updated = await db.updateConversation(id, authResult.user.id, {
      title: typeof title === 'string' ? title.trim() : undefined,
      pinned: typeof pinned === 'boolean' ? pinned : undefined,
      archived: typeof archived === 'boolean' ? archived : undefined,
      projectId: typeof projectId === 'string' ? projectId : undefined,
    })

    if (!updated) {
      return jsonError('Failed to update conversation', 404)
    }

    return jsonSuccess({ conversation: updated, message: 'Conversation updated successfully' })
  } catch (err: unknown) {
    const error = err as Error
    console.error('[Conversations API] Error updating conversation:', error)
    return jsonError('Failed to update conversation', 500)
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const authResult = await requireAuth(req)
  if ('errorResponse' in authResult) return authResult.errorResponse

  const { id } = await context.params
  const convo = await db.findConversationById(id)

  if (!convo || convo.user_id !== authResult.user.id) {
    return jsonError('Conversation not found or access denied', 404)
  }

  try {
    const deleted = await db.deleteConversation(id, authResult.user.id)
    if (!deleted) {
      return jsonError('Failed to delete conversation', 404)
    }

    return jsonSuccess({ success: true, message: 'Conversation deleted successfully' })
  } catch (err: unknown) {
    const error = err as Error
    console.error('[Conversations API] Error deleting conversation:', error)
    return jsonError('Failed to delete conversation', 500)
  }
}
