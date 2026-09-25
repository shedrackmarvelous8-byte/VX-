export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { jsonError, jsonSuccess, requireAuth } from '@/lib/auth/server'
import { geminiLiveService } from '@/lib/ai/live-service'

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(req)
  if ('errorResponse' in authResult) return authResult.errorResponse

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return jsonError('Invalid request body', 400)
    }

    const { sessionId, userTranscript, audioInputBase64, audioMimeType } = body

    if (!sessionId || typeof sessionId !== 'string') {
      return jsonError('sessionId is required', 400)
    }

    if (!userTranscript && !audioInputBase64) {
      return jsonError('Either userTranscript or audioInputBase64 must be provided', 400)
    }

    const result = await geminiLiveService.processVoiceTurn({
      sessionId,
      userId: authResult.user.id,
      userTranscript,
      audioInputBase64,
      audioMimeType,
    })

    return jsonSuccess({
      userMessage: result.userMessage,
      assistantMessage: result.assistantMessage,
      audioResponseBase64: result.audioResponseBase64,
      textResponse: result.textResponse,
    })
  } catch (err: unknown) {
    const error = err as Error
    console.error('[Gemini Live Voice Turn Error]:', error)
    return jsonError(error.message || 'Failed to process voice turn', 500)
  }
}
