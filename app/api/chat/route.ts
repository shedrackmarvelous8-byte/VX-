export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { jsonError, jsonSuccess, requireAuth } from '@/lib/auth/server'
import { db } from '@/lib/db/store'
import { processWorkIntelligenceMessage } from '@/lib/intelligence/service'
import { enforceRateLimit } from '@/lib/security/rate-limit'
import { formatSafeErrorMessage, redactSecrets } from '@/lib/security/redact'

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(req)
  if ('errorResponse' in authResult) return authResult.errorResponse

  // 1. Rate limiting on AI conversation requests
  const rateLimitResponse = enforceRateLimit(req, 'ai', authResult.user.id)
  if (rateLimitResponse) return rateLimitResponse

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return jsonError('Invalid request body', 400)
    }

    const {
      conversationId,
      message,
      modelId,
      stream = true,
      attachments,
      isCodingTask: isCodingTaskExplicit,
    } = body

    if (!conversationId || typeof conversationId !== 'string') {
      return jsonError('conversationId is required', 400)
    }

    // Verify conversation ownership to prevent IDOR
    const convo = await db.findConversationById(conversationId)
    if (!convo || convo.user_id !== authResult.user.id) {
      return jsonError('Conversation not found or access denied', 404)
    }

    // Save user message
    if (message && typeof message === 'string' && message.trim()) {
      await db.createMessage({
        conversationId,
        userId: authResult.user.id,
        role: 'user',
        content: message.trim(),
      })

      // Update conversation title if default
      if (convo.title === 'New chat' || convo.title === 'New conversation') {
        const cleanTitle = message.trim().split('\n')[0].slice(0, 60)
        if (cleanTitle) {
          await db.updateConversation(conversationId, authResult.user.id, { title: cleanTitle })
        }
      }
    }

    // Process via Work Intelligence (Context, Intent Classification, Multimodal, Review, Notes)
    if (!stream) {
      const response = await processWorkIntelligenceMessage({
        userId: authResult.user.id,
        conversationId,
        message: message || '',
        modelId,
        stream: false,
        attachments,
        isCodingTaskExplicit,
      })

      const sanitizedText = redactSecrets(response.text)

      const savedAssistantMessage = await db.createMessage({
        conversationId,
        userId: authResult.user.id,
        role: 'assistant',
        content: sanitizedText,
      })

      return jsonSuccess({
        message: savedAssistantMessage,
        model: response.model,
        intent: response.intent,
        agentResult: response.agentResult,
        generatedDocument: response.generatedDocument,
      })
    }

    const encoder = new TextEncoder()
    const customReadable = new ReadableStream({
      async start(controller) {
        let accumulatedText = ''

        try {
          const response = await processWorkIntelligenceMessage(
            {
              userId: authResult.user.id,
              conversationId,
              message: message || '',
              modelId,
              stream: true,
              attachments,
              isCodingTaskExplicit,
            },
            async (chunk) => {
              accumulatedText += chunk
              const safeChunk = redactSecrets(chunk)
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk: safeChunk })}\n\n`))
            }
          )

          const safeFullText = redactSecrets(accumulatedText || response.text)

          const savedMsg = await db.createMessage({
            conversationId,
            userId: authResult.user.id,
            role: 'assistant',
            content: safeFullText,
          })

          const donePayload = JSON.stringify({
            done: true,
            message: savedMsg,
            model: response.model,
            intent: response.intent,
            agentResult: response.agentResult,
            generatedDocument: response.generatedDocument,
          })
          controller.enqueue(encoder.encode(`data: ${donePayload}\n\n`))
          controller.close()
        } catch (err: unknown) {
          const safeError = formatSafeErrorMessage(err, 'An error occurred during response generation')
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: safeError, done: true })}\n\n`))
          controller.close()
        }
      },
    })

    return new NextResponse(customReadable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    })
  } catch (err: unknown) {
    return jsonError(formatSafeErrorMessage(err, 'Failed to process chat request'), 500)
  }
}
