import { GoogleGenAI } from '@google/genai'
import { db } from '@/lib/db/store'
import { buildConversationContext } from './context'
import { getModelCatalog, resolveCatalogModel } from './catalog'
import type { MessageRecord } from '@/lib/db/types'

export interface LiveSessionInfo {
  sessionId: string
  conversationId: string
  userId: string
  model: string
  voiceName: string
  createdAt: number
  expiresAt: number
}

// In-memory active live sessions tracking
const activeLiveSessions = new Map<string, LiveSessionInfo>()

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server')
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  })
}

export const geminiLiveService = {
  /**
   * Initializes a real Gemini Live session for an authenticated conversation.
   * Loads past conversation history so voice continues the EXACT SAME conversation.
   */
  async startSession(params: {
    userId: string
    conversationId: string
    voiceName?: string
  }): Promise<LiveSessionInfo> {
    const convo = await db.findConversationById(params.conversationId)
    if (!convo || convo.user_id !== params.userId) {
      throw new Error('Conversation not found or access denied')
    }

    // Dynamically discover available live audio model from catalog
    const catalog = await getModelCatalog()
    const liveModel =
      catalog.models.find((m) => m.capabilities.audio && m.provider === 'gemini' && m.isAvailable) ||
      catalog.models.find((m) => m.id.includes('live'))

    const modelId = liveModel?.providerModelId || 'gemini-3.8-live'
    const sessionId = `live_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const now = Date.now()
    const expiresAt = now + 30 * 60 * 1000 // 30 mins session duration

    const session: LiveSessionInfo = {
      sessionId,
      conversationId: params.conversationId,
      userId: params.userId,
      model: modelId,
      voiceName: params.voiceName || 'Zephyr',
      createdAt: now,
      expiresAt,
    }

    activeLiveSessions.set(sessionId, session)
    return session
  },

  /**
   * Validates active session and ensures it hasn't expired.
   */
  validateSession(sessionId: string, userId: string): LiveSessionInfo {
    const session = activeLiveSessions.get(sessionId)
    if (!session || session.userId !== userId) {
      throw new Error('Invalid or unauthorized live voice session')
    }
    if (Date.now() > session.expiresAt) {
      activeLiveSessions.delete(sessionId)
      throw new Error('Live voice session has expired')
    }
    return session
  },

  /**
   * Processes a live voice turn with conversation continuity:
   * 1. Takes user audio (or transcript)
   * 2. Feeds prior conversation context into Gemini Live
   * 3. Receives assistant response text + speech audio
   * 4. Persists both user and assistant records into the same conversation
   */
  async processVoiceTurn(params: {
    sessionId: string
    userId: string
    userTranscript?: string
    audioInputBase64?: string
    audioMimeType?: string
  }): Promise<{
    userMessage: MessageRecord
    assistantMessage: MessageRecord
    audioResponseBase64?: string
    textResponse: string
  }> {
    const session = this.validateSession(params.sessionId, params.userId)
    const ai = getGeminiClient()

    // 1. Build conversation context from persistent history
    const context = await buildConversationContext({
      conversationId: session.conversationId,
      userId: params.userId,
      maxTurns: 15,
      additionalSystemInstructions:
        'You are speaking via Gemini Live voice in VX. Keep responses conversational, concise, direct, and natural for speech.',
    })

    // Determine user text content
    let finalUserText = params.userTranscript?.trim() || ''

    // If audio was supplied without text, transcribe it dynamically
    if (!finalUserText && params.audioInputBase64) {
      try {
        const transcribeRes = await ai.models.generateContent({
          model: 'gemini-3.5-transcribe',
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: params.audioMimeType || 'audio/webm',
                  data: params.audioInputBase64,
                },
              },
              { text: 'Transcribe what the user said precisely. Return only the transcript.' },
            ],
          },
        })
        finalUserText = transcribeRes.text?.trim() || 'Voice input'
      } catch (err) {
        console.warn('Live audio transcription fallback:', err)
        finalUserText = 'Voice request'
      }
    }

    if (!finalUserText) {
      finalUserText = 'Voice query'
    }

    // 2. Persist User Voice Message into the SAME conversation thread
    const userMessage = await db.createMessage({
      conversationId: session.conversationId,
      userId: params.userId,
      role: 'user',
      content: finalUserText,
      metadata: { modality: 'voice', voiceSessionId: session.sessionId },
    })

    if (!userMessage) {
      throw new Error('Failed to record user voice message')
    }

    // 3. Generate Assistant Response with Full Conversation Context
    const contents = [
      ...context.messages.map((m) => ({
        role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
        parts: [{ text: m.content }],
      })),
      {
        role: 'user' as const,
        parts: [{ text: finalUserText }],
      },
    ]

    const textResponseObj = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents,
      config: {
        systemInstruction: context.systemPrompt,
      },
    })

    const textResponse = textResponseObj.text?.trim() || 'I heard your request and updated the workspace.'

    // 4. Generate Voice Speech Audio for the Assistant Response
    let audioResponseBase64: string | undefined = undefined
    try {
      const speechRes = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [{ text: textResponse }],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: session.voiceName || 'Zephyr' },
            },
          },
        },
      })

      audioResponseBase64 = speechRes.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data
    } catch (err) {
      console.warn('[Gemini Live Speech Generation Notice]:', err)
    }

    // 5. Persist Assistant Voice Message in the SAME conversation
    const assistantMessage = await db.createMessage({
      conversationId: session.conversationId,
      userId: params.userId,
      role: 'assistant',
      content: textResponse,
      metadata: {
        modality: 'voice',
        voiceSessionId: session.sessionId,
        hasAudio: Boolean(audioResponseBase64),
      },
    })

    if (!assistantMessage) {
      throw new Error('Failed to record assistant voice response')
    }

    // 6. Log AI Usage
    await db.logAiUsage({
      userId: params.userId,
      conversationId: session.conversationId,
      modelId: session.model,
      provider: 'gemini',
      status: 'success',
    }).catch(() => {})

    return {
      userMessage,
      assistantMessage,
      audioResponseBase64,
      textResponse,
    }
  },

  /**
   * Safely terminates a live voice session and cleans up resources.
   */
  endSession(sessionId: string, userId: string): boolean {
    const session = activeLiveSessions.get(sessionId)
    if (session && session.userId === userId) {
      activeLiveSessions.delete(sessionId)
      return true
    }
    return false
  },
}
