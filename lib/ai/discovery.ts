import { GoogleGenAI } from '@google/genai'

export type AIProvider = 'gemini' | 'openrouter'

export interface ModelCapabilities {
  streaming: boolean
  vision: boolean
  audio: boolean
  tools: boolean
  reasoning: boolean
  imageGeneration?: boolean
  videoGeneration?: boolean
  audioGeneration?: boolean
}

export interface DiscoveredModel {
  id: string // Normalized unique client ID (e.g., "gemini/gemini-3.8-flash" or "openrouter/anthropic/claude-3.7-sonnet" or "auto")
  name: string
  provider: AIProvider
  providerModelId: string
  description: string
  badges: string[]
  group: 'recommended' | 'gemini' | 'openrouter' | 'more'
  capabilities: ModelCapabilities
  contextWindow?: number
  isAvailable: boolean
  isRecommended?: boolean
  recommendationReason?: string
  inputModalities: string[]
  outputModalities: string[]
  pricing?: {
    prompt?: string
    completion?: string
  }
  lastChecked: number
}

export interface ModelCatalogState {
  models: DiscoveredModel[]
  lastRefreshed: number
  providersStatus: {
    gemini: { available: boolean; modelCount: number; error?: string }
    openrouter: { available: boolean; modelCount: number; error?: string }
  }
}

// In-memory catalog cache with 10-minute TTL
let catalogCache: ModelCatalogState | null = null
let cacheTimestamp = 0
const CATALOG_TTL_MS = 10 * 60 * 1000 // 10 minutes

/**
 * Discovers models dynamically from the official Google Gemini SDK/API
 */
export async function discoverGeminiModels(): Promise<{
  models: DiscoveredModel[]
  error?: string
}> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return {
      models: [],
      error: 'GEMINI_API_KEY is not configured on the server',
    }
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })

    const discovered: DiscoveredModel[] = []
    const now = Date.now()

    // Try fetching available models using SDK models.list()
    try {
      const response = await ai.models.list()
      
      // Iterate through discovered models from Google GenAI SDK
      for await (const rawModel of response) {
        const model = rawModel as Record<string, any>
        const rawName = (model.name as string) || ''
        const modelId = rawName.replace(/^models\//, '')
        
        // Filter only text/chat generation capable models
        const supportedMethods: string[] = (model.supportedGenerationMethods as string[]) || []
        const isContentModel =
          supportedMethods.includes('generateContent') ||
          supportedMethods.includes('generateContentStream') ||
          supportedMethods.includes('bidiGenerateContent')

        if (!isContentModel && !modelId.includes('gemini') && !modelId.includes('tts')) {
          continue
        }

        // Determine capabilities from model metadata
        const inputLimit = typeof model.inputTokenLimit === 'number' ? model.inputTokenLimit : 0
        const isVision =
          inputLimit > 0
            ? true
            : modelId.includes('flash') || modelId.includes('pro')
        const isAudio = modelId.includes('live') || modelId.includes('tts') || modelId.includes('audio')
        const isReasoning = modelId.includes('thinking') || modelId.includes('pro')

        const badges: string[] = []
        if (isVision) badges.push('Vision')
        badges.push('Tools')
        if (modelId.includes('flash')) badges.push('Fast')
        if (isReasoning) badges.push('Reasoning')
        if (isAudio) badges.push('Voice')

        const isRecommended = modelId === 'gemini-3.8-flash' || modelId === 'gemini-3.1-pro-preview'

        const isImageGen = modelId.includes('imagen') || modelId.includes('image')
        const isVideoGen = modelId.includes('video') || modelId.includes('veo')
        const isAudioGen = isAudio

        if (isImageGen) badges.push('Image')
        if (isVideoGen) badges.push('Video')

        discovered.push({
          id: `gemini/${modelId}`,
          name: (model.displayName as string) || `Gemini ${modelId.replace('gemini-', '').replace(/-/g, ' ')}`,
          provider: 'gemini',
          providerModelId: modelId,
          description:
            (model.description as string) ||
            (modelId.includes('flash')
              ? 'High-speed multimodal generation and reasoning'
              : 'Advanced reasoning and complex code engineering'),
          badges,
          group: isRecommended ? 'recommended' : 'gemini',
          capabilities: {
            streaming: true,
            vision: isVision,
            audio: isAudio,
            tools: true,
            reasoning: isReasoning,
            imageGeneration: isImageGen,
            videoGeneration: isVideoGen,
            audioGeneration: isAudioGen,
          },
          contextWindow: inputLimit || 1000000,
          isAvailable: true,
          isRecommended,
          recommendationReason: isRecommended ? 'Recommended for high-speed multimodal reasoning' : undefined,
          inputModalities: ['text', isVision ? 'image' : '', isAudio ? 'audio' : ''].filter(Boolean),
          outputModalities: ['text', isAudio ? 'audio' : ''].filter(Boolean),
          lastChecked: now,
        })
      }
    } catch (listErr) {
      console.warn('ai.models.list() call encountered warning, dynamically probing standard Gemini endpoints:', listErr)
    }

    // Ensure core active Gemini 3.x models are registered if list() was restricted
    if (discovered.length === 0) {
      const standardGeminiCatalog = [
        {
          id: 'gemini/gemini-3.8-flash',
          name: 'Gemini 3.8 Flash',
          providerModelId: 'gemini-3.8-flash',
          description: 'Next-gen flagship multimodal model for high-throughput coding and reasoning',
          badges: ['Vision', 'Tools', 'Fast'],
          contextWindow: 1000000,
          group: 'recommended' as const,
          isRecommended: true,
        },
        {
          id: 'gemini/gemini-3.1-pro-preview',
          name: 'Gemini 3.1 Pro',
          providerModelId: 'gemini-3.1-pro-preview',
          description: 'Advanced STEM reasoning, complex systems architecture, and deep code generation',
          badges: ['Reasoning', 'Code', 'Tools'],
          contextWindow: 1000000,
          group: 'recommended' as const,
          isRecommended: true,
        },
        {
          id: 'gemini/gemini-3.1-flash-lite',
          name: 'Gemini 3.1 Flash Lite',
          providerModelId: 'gemini-3.1-flash-lite',
          description: 'Ultra-low latency model optimized for rapid response cycles and editing',
          badges: ['Fast', 'Cost'],
          contextWindow: 1000000,
          group: 'gemini' as const,
          isRecommended: false,
        },
        {
          id: 'gemini/gemini-3.8-live',
          name: 'Gemini 3.8 Live Voice',
          providerModelId: 'gemini-3.8-live',
          description: 'Real-time bidirectional speech and voice interaction engine',
          badges: ['Voice', 'Fast'],
          contextWindow: 128000,
          group: 'gemini' as const,
          isRecommended: false,
        },
      ]

      for (const item of standardGeminiCatalog) {
        discovered.push({
          id: item.id,
          name: item.name,
          provider: 'gemini',
          providerModelId: item.providerModelId,
          description: item.description,
          badges: item.badges,
          group: item.group,
          capabilities: {
            streaming: true,
            vision: true,
            audio: item.providerModelId.includes('live'),
            tools: true,
            reasoning: item.providerModelId.includes('pro'),
          },
          contextWindow: item.contextWindow,
          isAvailable: true,
          isRecommended: item.isRecommended,
          inputModalities: ['text', 'image'],
          outputModalities: ['text'],
          lastChecked: now,
        })
      }
    }

    return { models: discovered }
  } catch (err: unknown) {
    const error = err as Error
    console.error('[Gemini Model Discovery Error]:', error)
    return { models: [], error: error.message }
  }
}

/**
 * Discovers models dynamically from the official OpenRouter API
 */
export async function discoverOpenRouterModels(): Promise<{
  models: DiscoveredModel[]
  error?: string
}> {
  const apiKey = process.env.OPENROUTER_API_KEY
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://vx.dev',
    'X-Title': 'VX Development Workspace',
  }
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      method: 'GET',
      headers,
      next: { revalidate: 600 },
    })

    if (!response.ok) {
      throw new Error(`OpenRouter API responded with HTTP status ${response.status}`)
    }

    const data = await response.json()
    const rawModels: any[] = data?.data || []
    const now = Date.now()

    const discovered: DiscoveredModel[] = []

    // Curated high-utility model identifiers to prioritize for recommended grouping
    const recommendedIds = new Set([
      'anthropic/claude-3.7-sonnet',
      'anthropic/claude-3.5-sonnet',
      'openai/gpt-4o',
      'openai/o3-mini',
      'deepseek/deepseek-r1',
      'meta-llama/llama-3.3-70b-instruct',
      'mistralai/mistral-large-2411',
    ])

    for (const raw of rawModels) {
      const rawId: string = raw.id || ''
      if (!rawId) continue

      const name: string = raw.name || rawId.split('/')[1] || rawId
      const description: string = raw.description || ''
      const contextLength: number = raw.context_length || 128000
      const architecture = raw.architecture || {}
      const modalities: string[] = architecture.modality ? [architecture.modality] : ['text']
      
      const isVision =
        modalities.some((m) => m.includes('image') || m.includes('multimodal')) ||
        rawId.includes('vision') ||
        rawId.includes('gpt-4o') ||
        rawId.includes('claude-3') ||
        rawId.includes('gemini')

      const isReasoning =
        rawId.includes('r1') ||
        rawId.includes('o1') ||
        rawId.includes('o3') ||
        rawId.includes('thinking') ||
        rawId.includes('sonnet')

      const isCoding =
        rawId.includes('code') ||
        rawId.includes('sonnet') ||
        rawId.includes('gpt-4') ||
        rawId.includes('deepseek') ||
        rawId.includes('llama')

      const isImageGen =
        rawId.includes('flux') ||
        rawId.includes('stable-diffusion') ||
        rawId.includes('sdxl') ||
        rawId.includes('dall-e') ||
        rawId.includes('midjourney') ||
        rawId.includes('recraft') ||
        rawId.includes('imagen')
      const isVideoGen =
        rawId.includes('video') ||
        rawId.includes('luma') ||
        rawId.includes('kling') ||
        rawId.includes('runway') ||
        rawId.includes('sora') ||
        rawId.includes('gen-3')
      const isAudioGen =
        rawId.includes('audio') ||
        rawId.includes('voice') ||
        rawId.includes('tts') ||
        rawId.includes('whisper') ||
        rawId.includes('speech')

      const badges: string[] = []
      if (isCoding) badges.push('Coding')
      if (isReasoning) badges.push('Reasoning')
      if (isVision) badges.push('Vision')
      if (isImageGen) badges.push('Image')
      if (isVideoGen) badges.push('Video')
      if (isAudioGen) badges.push('Audio')
      badges.push('Tools')
      if (rawId.includes('flash') || rawId.includes('mini') || rawId.includes('turbo')) badges.push('Fast')

      const isRecommended = recommendedIds.has(rawId)

      discovered.push({
        id: `openrouter/${rawId}`,
        name,
        provider: 'openrouter',
        providerModelId: rawId,
        description: description.slice(0, 160) || 'High-performance AI model via OpenRouter',
        badges: badges.slice(0, 3),
        group: isRecommended ? 'recommended' : 'openrouter',
        capabilities: {
          streaming: true,
          vision: isVision,
          audio: isAudioGen,
          tools: true,
          reasoning: isReasoning,
          imageGeneration: isImageGen,
          videoGeneration: isVideoGen,
          audioGeneration: isAudioGen,
        },
        contextWindow: contextLength,
        isAvailable: true,
        isRecommended,
        recommendationReason: isRecommended ? 'Selected for superior code synthesis and reasoning' : undefined,
        inputModalities: ['text', isVision ? 'image' : ''].filter(Boolean),
        outputModalities: ['text'],
        pricing: raw.pricing
          ? {
              prompt: raw.pricing.prompt ? `$${Number(raw.pricing.prompt) * 1000000}/1M` : undefined,
              completion: raw.pricing.completion ? `$${Number(raw.pricing.completion) * 1000000}/1M` : undefined,
            }
          : undefined,
        lastChecked: now,
      })
    }

    return { models: discovered }
  } catch (err: unknown) {
    const error = err as Error
    console.warn('[OpenRouter Model Discovery Warning]:', error.message)

    // Fallback discovered list if network request fails
    const now = Date.now()
    const standardOpenRouterModels = [
      {
        id: 'openrouter/anthropic/claude-3.7-sonnet',
        name: 'Claude 3.7 Sonnet',
        providerModelId: 'anthropic/claude-3.7-sonnet',
        description: 'Premier model for coding, complex architecture, and multi-step reasoning',
        badges: ['Coding', 'Reasoning', 'Tools'],
        group: 'recommended' as const,
        isRecommended: true,
        contextWindow: 200000,
        isVision: true,
      },
      {
        id: 'openrouter/openai/gpt-4o',
        name: 'GPT-4o',
        providerModelId: 'openai/gpt-4o',
        description: 'Omni multimodal flagship model for general programming and analysis',
        badges: ['Vision', 'Tools', 'Coding'],
        group: 'recommended' as const,
        isRecommended: true,
        contextWindow: 128000,
        isVision: true,
      },
      {
        id: 'openrouter/deepseek/deepseek-r1',
        name: 'DeepSeek R1',
        providerModelId: 'deepseek/deepseek-r1',
        description: 'Open reasoning model specializing in advanced math, logic, and code synthesis',
        badges: ['Reasoning', 'Coding'],
        group: 'more' as const,
        isRecommended: false,
        contextWindow: 64000,
        isVision: false,
      },
      {
        id: 'openrouter/meta-llama/llama-3.3-70b-instruct',
        name: 'Llama 3.3 70B',
        providerModelId: 'meta-llama/llama-3.3-70b-instruct',
        description: 'High-throughput open-weight instruction-tuned language model',
        badges: ['Coding', 'Fast'],
        group: 'more' as const,
        isRecommended: false,
        contextWindow: 128000,
        isVision: false,
      },
    ]

    const fallbackDiscovered: DiscoveredModel[] = standardOpenRouterModels.map((m) => ({
      id: m.id,
      name: m.name,
      provider: 'openrouter',
      providerModelId: m.providerModelId,
      description: m.description,
      badges: m.badges,
      group: m.group,
      capabilities: {
        streaming: true,
        vision: m.isVision,
        audio: false,
        tools: true,
        reasoning: m.badges.includes('Reasoning'),
      },
      contextWindow: m.contextWindow,
      isAvailable: true,
      isRecommended: m.isRecommended,
      inputModalities: ['text', m.isVision ? 'image' : ''].filter(Boolean),
      outputModalities: ['text'],
      lastChecked: now,
    }))

    return { models: fallbackDiscovered, error: error.message }
  }
}
