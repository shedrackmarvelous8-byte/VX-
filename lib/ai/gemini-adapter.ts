import { GoogleGenAI } from '@google/genai'
import type { StandardChatMessage } from './context'

export interface GeminiGenerationResult {
  text: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

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

function formatContentsForGemini(messages: StandardChatMessage[]) {
  if (!messages || messages.length === 0) {
    return [{ role: 'user' as const, parts: [{ text: 'Hello' }] }]
  }
  return messages.map((m) => {
    const parts: any[] = [{ text: m.content || ' ' }]
    if (m.images && m.images.length > 0) {
      for (const img of m.images) {
        parts.push({
          inlineData: {
            mimeType: img.mimeType,
            data: img.data,
          },
        })
      }
    }
    return {
      role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
      parts,
    }
  })
}

export async function generateGeminiResponse(params: {
  targetModel: string
  systemPrompt: string
  messages: StandardChatMessage[]
}): Promise<GeminiGenerationResult> {
  const ai = getGeminiClient()
  const contents = formatContentsForGemini(params.messages)

  const response = await ai.models.generateContent({
    model: params.targetModel,
    contents,
    config: {
      systemInstruction: params.systemPrompt,
    },
  })

  const text = response.text || ''
  const usage = response.usageMetadata
    ? {
        promptTokens: response.usageMetadata.promptTokenCount || 0,
        completionTokens: response.usageMetadata.candidatesTokenCount || 0,
        totalTokens: response.usageMetadata.totalTokenCount || 0,
      }
    : undefined

  return { text, usage }
}

export async function streamGeminiResponse(params: {
  targetModel: string
  systemPrompt: string
  messages: StandardChatMessage[]
  onChunk: (chunk: string) => Promise<void> | void
}): Promise<GeminiGenerationResult> {
  const ai = getGeminiClient()
  const contents = formatContentsForGemini(params.messages)

  const responseStream = await ai.models.generateContentStream({
    model: params.targetModel,
    contents,
    config: {
      systemInstruction: params.systemPrompt,
    },
  })

  let fullText = ''
  let finalUsage: GeminiGenerationResult['usage'] = undefined

  for await (const chunk of responseStream) {
    const chunkText = chunk.text || ''
    if (chunkText) {
      fullText += chunkText
      await params.onChunk(chunkText)
    }

    if (chunk.usageMetadata) {
      finalUsage = {
        promptTokens: chunk.usageMetadata.promptTokenCount || 0,
        completionTokens: chunk.usageMetadata.candidatesTokenCount || 0,
        totalTokens: chunk.usageMetadata.totalTokenCount || 0,
      }
    }
  }

  return { text: fullText, usage: finalUsage }
}
