import { findModelById, DEFAULT_MODEL_ID, type ModelDefinition } from './models'
import { buildConversationContext, type StandardChatMessage } from './context'
import { generateGeminiResponse, streamGeminiResponse } from './gemini-adapter'
import { generateOpenRouterResponse, streamOpenRouterResponse } from './openrouter-adapter'

export interface AiServiceRequest {
  modelId?: string
  conversationId: string
  userId: string
  additionalSystemInstructions?: string
}

export interface AiServiceResponse {
  model: ModelDefinition
  text: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

function normalizeAiError(err: unknown, model: ModelDefinition): string {
  const message = err instanceof Error ? err.message : String(err)

  if (message.includes('API_KEY') || message.includes('API key') || message.includes('unauthorized') || message.includes('401')) {
    return `${model.name} is currently configuring credentials. Please verify server environment variables or try another model.`
  }

  if (message.includes('quota') || message.includes('Rate limit') || message.includes('429')) {
    return `${model.name} is temporarily experiencing high demand. Please try again in a moment or select another model.`
  }

  if (message.includes('Context too large') || message.includes('maximum context')) {
    return `The conversation context exceeds the token limit for ${model.name}. Try starting a new chat or trimming messages.`
  }

  if (message.includes('fetch failed') || message.includes('Network') || message.includes('timeout')) {
    return `Connection to ${model.name} provider timed out. Please check your connection and retry.`
  }

  return `${model.name} service error: ${message.slice(0, 120)}`
}

export const aiService = {
  getModel(modelId?: string): ModelDefinition {
    const selected = modelId ? findModelById(modelId) : findModelById(DEFAULT_MODEL_ID)
    if (!selected || !selected.enabled) {
      // Fallback to default
      const def = findModelById(DEFAULT_MODEL_ID)
      if (!def) throw new Error('No AI model available in registry')
      return def
    }
    return selected
  },

  async generate(params: AiServiceRequest): Promise<AiServiceResponse> {
    const model = this.getModel(params.modelId)
    const context = await buildConversationContext({
      conversationId: params.conversationId,
      userId: params.userId,
      additionalSystemInstructions: params.additionalSystemInstructions,
    })

    try {
      if (model.provider === 'gemini') {
        const result = await generateGeminiResponse({
          targetModel: model.targetModel,
          systemPrompt: context.systemPrompt,
          messages: context.messages,
        })
        return { model, text: result.text, usage: result.usage }
      } else {
        const result = await generateOpenRouterResponse({
          targetModel: model.targetModel,
          systemPrompt: context.systemPrompt,
          messages: context.messages,
        })
        return { model, text: result.text, usage: result.usage }
      }
    } catch (err) {
      console.error(`[AI Service Error - ${model.name}]:`, err)
      throw new Error(normalizeAiError(err, model))
    }
  },

  async stream(
    params: AiServiceRequest,
    onChunk: (chunk: string) => Promise<void> | void
  ): Promise<AiServiceResponse> {
    const model = this.getModel(params.modelId)
    const context = await buildConversationContext({
      conversationId: params.conversationId,
      userId: params.userId,
      additionalSystemInstructions: params.additionalSystemInstructions,
    })

    try {
      if (model.provider === 'gemini') {
        const result = await streamGeminiResponse({
          targetModel: model.targetModel,
          systemPrompt: context.systemPrompt,
          messages: context.messages,
          onChunk,
        })
        return { model, text: result.text, usage: result.usage }
      } else {
        const result = await streamOpenRouterResponse({
          targetModel: model.targetModel,
          systemPrompt: context.systemPrompt,
          messages: context.messages,
          onChunk,
        })
        return { model, text: result.text, usage: result.usage }
      }
    } catch (err) {
      console.error(`[AI Service Stream Error - ${model.name}]:`, err)
      throw new Error(normalizeAiError(err, model))
    }
  },
}
