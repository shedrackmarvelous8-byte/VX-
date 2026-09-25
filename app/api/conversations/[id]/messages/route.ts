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

  try {
    const { searchParams } = new URL(req.url)
    const limitParam = searchParams.get('limit')
    const before = searchParams.get('before') || undefined

    const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10) || 50), 200) : 100

    const messages = await db.listMessagesByConversation(id, authResult.user.id, {
      limit,
      before,
    })

    return jsonSuccess({ messages })
  } catch (err: unknown) {
    const error = err as Error
    console.error('[Messages API] Error listing messages:', error)
    return jsonError('Failed to fetch messages', 500)
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
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

    const { content, role = 'user', metadata } = body

    if (typeof content !== 'string' || !content.trim()) {
      return jsonError('Message content cannot be empty', 400)
    }

    const validRoles = ['user', 'assistant', 'system'] as const
    const finalRole = validRoles.includes(role) ? role : 'user'

    const savedMessage = await db.createMessage({
      conversationId: id,
      userId: authResult.user.id,
      role: finalRole,
      content: content.trim(),
      metadata: metadata && typeof metadata === 'object' ? metadata : undefined,
    })

    if (!savedMessage) {
      return jsonError('Failed to save message', 500)
    }

    // If this is the conversation's first user message and title is still default "New chat", update title intelligently
    if (convo.title === 'New chat' && finalRole === 'user') {
      const generatedTitle = content.trim().split('\n')[0].slice(0, 60)
      if (generatedTitle) {
        await db.updateConversation(id, authResult.user.id, { title: generatedTitle })
      }
    }

    return jsonSuccess({ message: savedMessage }, 201)
  } catch (err: unknown) {
    const error = err as Error
    console.error('[Messages API] Error creating message:', error)
    return jsonError('Failed to create message', 500)
  }
}
