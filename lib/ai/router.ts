import {
  resolveCatalogModel,
  AUTO_MODEL_ID,
  getModelCatalog,
  type DiscoveredModel,
} from './catalog'
import { buildConversationContext, type StandardChatMessage } from './context'
import { generateGeminiResponse, streamGeminiResponse } from './gemini-adapter'
import { generateOpenRouterResponse, streamOpenRouterResponse } from './openrouter-adapter'
import { db } from '@/lib/db/store'

export interface AIRouterRequest {
  userId: string
  conversationId: string
  projectId?: string | null
  modelId?: string
  message?: string
  attachments?: Array<{ id: string; name: string; kind: string; url?: string }>
  additionalSystemInstructions?: string
  stream?: boolean
}

export interface AIRouterResult {
  model: DiscoveredModel
  actualModel: DiscoveredModel
  text: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export class AIRouterError extends Error {
  constructor(
    message: string,
    public statusCode = 400,
    public code = 'AI_ROUTER_ERROR'
  ) {
    super(message)
    this.name = 'AIRouterError'
  }
}

export const aiRouter = {
  /**
   * Resolves and validates requested model strictly according to user selection or dynamic auto-recommendation.
   */
  async resolveModel(
    modelId?: string,
    contextInfo?: {
      hasImages?: boolean
      hasAudio?: boolean
      isCodingTask?: boolean
      isReasoningTask?: boolean
    }
  ): Promise<{ model: DiscoveredModel; actualModel: DiscoveredModel }> {
    try {
      const resolution = await resolveCatalogModel(modelId, contextInfo)
      const actualModel = resolution.recommendedActualModel || resolution.model

      if (!actualModel.isAvailable) {
        throw new AIRouterError(
          `Model "${actualModel.name}" is currently marked unavailable by the provider. Please choose another model or use Auto.`,
          400,
          'MODEL_UNAVAILABLE'
        )
      }

      return {
        model: resolution.model,
        actualModel,
      }
    } catch (err: unknown) {
      if (err instanceof AIRouterError) throw err
      const error = err as Error
      throw new AIRouterError(error.message, 400, 'MODEL_RESOLUTION_ERROR')
    }
  },

  /**
   * Prepares standardized conversation context respecting token limits and system instructions.
   */
  async getContext(params: {
    conversationId: string
    userId: string
    additionalSystemInstructions?: string
    maxTurns?: number
  }) {
    return buildConversationContext(params)
  },

  /**
   * Routes generation request to the appropriate provider adapter (Gemini or OpenRouter).
   */
  async routeGenerate(req: AIRouterRequest): Promise<AIRouterResult> {
    const hasImages = Boolean(req.attachments && req.attachments.some((a) => a.kind === 'image'))
    const isCodingTask = Boolean(
      req.message &&
        /(\bcode\b|\bbuild\b|\bfunction\b|\bcomponent\b|\breact\b|\bnext\b|\bts\b|\bhtml\b|\bcss\b|\bapi\b)/i.test(
          req.message
        )
    )

    const { model, actualModel } = await this.resolveModel(req.modelId, {
      hasImages,
      isCodingTask,
    })

    const context = await this.getContext({
      conversationId: req.conversationId,
      userId: req.userId,
      additionalSystemInstructions: req.additionalSystemInstructions,
    })

    let currentActualModel = actualModel
    let result: {
      text: string
      usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
    } = {
      text: '',
    }

    try {
      if (currentActualModel.provider === 'gemini') {
        result = await generateGeminiResponse({
          targetModel: currentActualModel.providerModelId,
          systemPrompt: context.systemPrompt,
          messages: context.messages,
        })
      } else if (currentActualModel.provider === 'openrouter') {
        result = await generateOpenRouterResponse({
          targetModel: currentActualModel.providerModelId,
          systemPrompt: context.systemPrompt,
          messages: context.messages,
        })
      } else {
        throw new AIRouterError(
          `Unsupported provider "${currentActualModel.provider}" for model ${currentActualModel.name}`,
          500,
          'PROVIDER_UNSUPPORTED'
        )
      }
    } catch (err: unknown) {
      const error = err as Error
      const isUnavailable = /503|UNAVAILABLE|high demand|overloaded|service unavailable/i.test(error.message)

      if (isUnavailable) {
        console.warn(`[AI Router] Model ${currentActualModel.name} is overloaded (503). Attempting fallback...`)
        const catalog = await getModelCatalog()
        const fallbacks = [
          ...catalog.models.filter(
            (m) => m.id !== currentActualModel.id && m.isAvailable && m.provider === 'gemini'
          ),
          {
            id: 'gemini/gemini-2.5-flash',
            name: 'Gemini 2.5 Flash',
            provider: 'gemini' as const,
            providerModelId: 'gemini-2.5-flash',
          },
          {
            id: 'gemini/gemini-1.5-flash-latest',
            name: 'Gemini 1.5 Flash',
            provider: 'gemini' as const,
            providerModelId: 'gemini-1.5-flash-latest',
          },
        ]

        let fallbackSuccess = false
        for (const candidate of fallbacks) {
          try {
            console.log(`[AI Router] Attempting fallback model: ${candidate.providerModelId}`)
            result = await generateGeminiResponse({
              targetModel: candidate.providerModelId,
              systemPrompt: context.systemPrompt,
              messages: context.messages,
            })
            currentActualModel = candidate as any
            fallbackSuccess = true
            break
          } catch {
            // try next candidate
          }
        }

        if (!fallbackSuccess) {
          throw error
        }
      } else {
        console.error(`[AI Router Error - ${currentActualModel.name}]:`, error)
        await db.logAiUsage({
          userId: req.userId,
          projectId: req.projectId,
          conversationId: req.conversationId,
          modelId: currentActualModel.id,
          provider: currentActualModel.provider,
          status: 'failed',
          errorMessage: error.message,
        }).catch(() => {})

        throw new AIRouterError(
          error.message || `Failed to generate response using ${currentActualModel.name}`,
          500,
          'PROVIDER_EXECUTION_FAILED'
        )
      }
    }

    // Log AI Usage
    await db.logAiUsage({
      userId: req.userId,
      projectId: req.projectId,
      conversationId: req.conversationId,
      modelId: currentActualModel.id,
      provider: currentActualModel.provider,
      promptTokens: result.usage?.promptTokens,
      completionTokens: result.usage?.completionTokens,
      totalTokens: result.usage?.totalTokens,
      status: 'success',
    }).catch((err) => console.warn('Could not log AI usage:', err))

    return {
      model,
      actualModel: currentActualModel,
      text: result.text,
      usage: result.usage,
    }
  },

  /**
   * Routes streaming request to the appropriate provider adapter.
   */
  async routeStream(
    req: AIRouterRequest,
    onChunk: (chunk: string) => Promise<void> | void
  ): Promise<AIRouterResult> {
    const hasImages = Boolean(req.attachments && req.attachments.some((a) => a.kind === 'image'))
    const isCodingTask = Boolean(
      req.message &&
        /(\bcode\b|\bbuild\b|\bfunction\b|\bcomponent\b|\breact\b|\bnext\b|\bts\b|\bhtml\b|\bcss\b|\bapi\b)/i.test(
          req.message
        )
    )

    const { model, actualModel } = await this.resolveModel(req.modelId, {
      hasImages,
      isCodingTask,
    })

    const context = await this.getContext({
      conversationId: req.conversationId,
      userId: req.userId,
      additionalSystemInstructions: req.additionalSystemInstructions,
    })

    let currentActualModel = actualModel
    let result: {
      text: string
      usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
    } = { text: '' }

    try {
      if (currentActualModel.provider === 'gemini') {
        result = await streamGeminiResponse({
          targetModel: currentActualModel.providerModelId,
          systemPrompt: context.systemPrompt,
          messages: context.messages,
          onChunk,
        })
      } else if (currentActualModel.provider === 'openrouter') {
        result = await streamOpenRouterResponse({
          targetModel: currentActualModel.providerModelId,
          systemPrompt: context.systemPrompt,
          messages: context.messages,
          onChunk,
        })
      } else {
        throw new AIRouterError(
          `Unsupported provider "${currentActualModel.provider}" for model ${currentActualModel.name}`,
          500,
          'PROVIDER_UNSUPPORTED'
        )
      }
    } catch (err: unknown) {
      const error = err as Error
      const isUnavailable = /503|UNAVAILABLE|high demand|overloaded|service unavailable/i.test(error.message)

      if (isUnavailable) {
        console.warn(`[AI Router] Model ${currentActualModel.name} is overloaded (503). Attempting fallback...`)
        const catalog = await getModelCatalog()
        const fallbacks = catalog.models.filter(
          (m) => m.id !== currentActualModel.id && m.isAvailable && m.provider === 'gemini'
        )
        const fallbackModel = fallbacks.find((m) => m.providerModelId.includes('flash')) || fallbacks[0]

        if (fallbackModel) {
          console.log(`[AI Router] Switching stream to fallback model: ${fallbackModel.name}`)
          currentActualModel = fallbackModel
          const notice = `*[Note: Primary model was busy (503); automatically switched to fallback model ${currentActualModel.name}.]*\n\n`
          await onChunk(notice)

          try {
            result = await streamGeminiResponse({
              targetModel: currentActualModel.providerModelId,
              systemPrompt: context.systemPrompt,
              messages: context.messages,
              onChunk,
            })
            result.text = notice + result.text
          } catch (fallbackErr) {
            throw error
          }
        } else {
          throw error
        }
      } else {
        console.error(`[AI Router Stream Error - ${currentActualModel.name}]:`, error)
        await db.logAiUsage({
          userId: req.userId,
          projectId: req.projectId,
          conversationId: req.conversationId,
          modelId: currentActualModel.id,
          provider: currentActualModel.provider,
          status: 'failed',
          errorMessage: error.message,
        }).catch(() => {})

        throw new AIRouterError(
          error.message || `Streaming failed with ${currentActualModel.name}`,
          500,
          'PROVIDER_STREAM_FAILED'
        )
      }
    }

    // Log AI Usage
    await db.logAiUsage({
      userId: req.userId,
      projectId: req.projectId,
      conversationId: req.conversationId,
      modelId: currentActualModel.id,
      provider: currentActualModel.provider,
      promptTokens: result.usage?.promptTokens,
      completionTokens: result.usage?.completionTokens,
      totalTokens: result.usage?.totalTokens,
      status: 'success',
    }).catch((err) => console.warn('Could not log AI usage:', err))

    return {
      model,
      actualModel: currentActualModel,
      text: result.text,
      usage: result.usage,
    }
  },
}
