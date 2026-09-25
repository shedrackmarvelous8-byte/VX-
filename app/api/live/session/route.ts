export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { jsonError, jsonSuccess, requireAuth } from '@/lib/auth/server'
import { geminiLiveService } from '@/lib/ai/live-service'
import { db } from '@/lib/db/store'

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(req)
  if ('errorResponse' in authResult) return authResult.errorResponse

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return jsonError('Invalid request body', 400)
    }

    let { conversationId, voiceName } = body

    // If conversationId is missing, create a new conversation for voice automatically
    if (!conversationId) {
      const userProjects = await db.listProjectsByUser(authResult.user.id)
      const projectId = userProjects[0]?.id || (await db.createProject({ userId: authResult.user.id, name: 'Workspace' })).id
      const newConvo = await db.createConversation({
        userId: authResult.user.id,
        projectId,
        title: 'Voice conversation',
      })
      conversationId = newConvo.id
    } else {
      // Verify conversation ownership
      const convo = await db.findConversationById(conversationId)
      if (!convo || convo.user_id !== authResult.user.id) {
        return jsonError('Conversation not found or access denied', 404)
      }
    }

    const session = await geminiLiveService.startSession({
      userId: authResult.user.id,
      conversationId,
      voiceName,
    })

    return jsonSuccess({
      session,
      message: 'Gemini Live voice session connected',
    })
  } catch (err: unknown) {
    const error = err as Error
    console.error('[Gemini Live Session API Error]:', error)
    return jsonError(error.message || 'Failed to start Gemini Live session', 500)
  }
}

export async function DELETE(req: NextRequest) {
  const authResult = await requireAuth(req)
  if ('errorResponse' in authResult) return authResult.errorResponse

  try {
    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get('sessionId')
    if (!sessionId) {
      return jsonError('sessionId parameter is required', 400)
    }

    const ended = geminiLiveService.endSession(sessionId, authResult.user.id)
    return jsonSuccess({ success: true, ended })
  } catch (err: unknown) {
    const error = err as Error
    return jsonError(error.message || 'Failed to end live session', 500)
  }
}
