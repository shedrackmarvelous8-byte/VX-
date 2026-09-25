import {
  discoverGeminiModels,
  discoverOpenRouterModels,
  type DiscoveredModel,
  type ModelCatalogState,
} from './discovery'

export type { DiscoveredModel, ModelCatalogState }

let cachedCatalogState: ModelCatalogState | null = null
let lastFetchTime = 0
const CACHE_TTL = 10 * 60 * 1000 // 10 minutes

export const AUTO_MODEL_ID = 'auto'

export const AUTO_MODEL_DEFINITION: DiscoveredModel = {
  id: AUTO_MODEL_ID,
  name: 'Auto',
  provider: 'gemini',
  providerModelId: 'auto',
  description: 'Dynamically routes to the best model based on prompt complexity, modalities, and task type',
  badges: ['Smart Routing', 'Dynamic'],
  group: 'recommended',
  capabilities: {
    streaming: true,
    vision: true,
    audio: true,
    tools: true,
    reasoning: true,
  },
  contextWindow: 1000000,
  isAvailable: true,
  isRecommended: true,
  recommendationReason: 'Recommended — Automatically selects optimal model for coding, reasoning, or speed',
  inputModalities: ['text', 'image', 'audio'],
  outputModalities: ['text'],
  lastChecked: Date.now(),
}

/**
 * Retrieves the normalized dynamic model catalog, refreshing cache if stale or requested.
 */
export async function getModelCatalog(forceRefresh = false): Promise<ModelCatalogState> {
  const now = Date.now()

  if (!forceRefresh && cachedCatalogState && now - lastFetchTime < CACHE_TTL) {
    return cachedCatalogState
  }

  // Concurrently discover models from both official providers
  const [geminiResult, openrouterResult] = await Promise.all([
    discoverGeminiModels(),
    discoverOpenRouterModels(),
  ])

  const allModels: DiscoveredModel[] = [
    AUTO_MODEL_DEFINITION,
    ...geminiResult.models,
    ...openrouterResult.models,
  ]

  // Deduplicate and index models
  const seenIds = new Set<string>()
  const dedupedModels: DiscoveredModel[] = []

  for (const model of allModels) {
    if (!seenIds.has(model.id)) {
      seenIds.add(model.id)
      dedupedModels.push(model)
    }
  }

  cachedCatalogState = {
    models: dedupedModels,
    lastRefreshed: now,
    providersStatus: {
      gemini: {
        available: geminiResult.models.length > 0,
        modelCount: geminiResult.models.length,
        error: geminiResult.error,
      },
      openrouter: {
        available: openrouterResult.models.length > 0,
        modelCount: openrouterResult.models.length,
        error: openrouterResult.error,
      },
    },
  }

  lastFetchTime = now
  return cachedCatalogState
}

/**
 * Resolves a model ID against the dynamic catalog.
 * Handles alias matching (e.g. 'claude', 'gemini', 'gpt', 'auto', 'gemini/gemini-3.8-flash', etc.)
 */
export async function resolveCatalogModel(
  modelId?: string,
  context?: {
    hasImages?: boolean
    hasAudio?: boolean
    isCodingTask?: boolean
    isReasoningTask?: boolean
  }
): Promise<{ model: DiscoveredModel; recommendedActualModel?: DiscoveredModel }> {
  const catalog = await getModelCatalog()
  const cleanId = (modelId || AUTO_MODEL_ID).trim().toLowerCase()

  // 1. Handle Auto / Recommended dynamic resolution
  if (cleanId === 'auto' || cleanId === 'recommended' || !cleanId) {
    let resolvedTarget: DiscoveredModel | undefined

    // Find available models in catalog
    const available = catalog.models.filter((m) => m.id !== AUTO_MODEL_ID && m.isAvailable)

    if (context?.hasAudio) {
      // Prioritize audio/voice capable model
      resolvedTarget = available.find((m) => m.capabilities.audio)
    } else if (context?.hasImages) {
      // Prioritize vision capable model
      resolvedTarget =
        available.find((m) => m.capabilities.vision && m.provider === 'gemini') ||
        available.find((m) => m.capabilities.vision)
    } else if (context?.isReasoningTask) {
      // Prioritize deep reasoning model
      resolvedTarget =
        available.find((m) => m.capabilities.reasoning && m.id.includes('claude-3.7')) ||
        available.find((m) => m.capabilities.reasoning && m.id.includes('pro')) ||
        available.find((m) => m.capabilities.reasoning)
    }

    // Default high-performance fallback
    if (!resolvedTarget) {
      resolvedTarget =
        available.find((m) => m.id === 'gemini/gemini-3.8-flash') ||
        available.find((m) => m.provider === 'gemini' && m.isRecommended) ||
        available.find((m) => m.id.includes('claude-3.7')) ||
        available.find((m) => m.isRecommended) ||
        available[0]
    }

    if (!resolvedTarget) {
      throw new Error('No AI models are currently available in the dynamic catalog')
    }

    return {
      model: AUTO_MODEL_DEFINITION,
      recommendedActualModel: resolvedTarget,
    }
  }

  // 2. Direct exact ID match
  let found = catalog.models.find((m) => m.id.toLowerCase() === cleanId)

  // 3. Fallback alias matches for legacy / shorthand IDs
  if (!found) {
    const aliasMap: Record<string, string> = {
      claude: 'openrouter/anthropic/claude-3.7-sonnet',
      'claude-3.7': 'openrouter/anthropic/claude-3.7-sonnet',
      'claude-3.5': 'openrouter/anthropic/claude-3.5-sonnet',
      gemini: 'gemini/gemini-3.8-flash',
      'gemini-flash': 'gemini/gemini-3.8-flash',
      'gemini-3.5-flash': 'gemini/gemini-3.5-flash',
      'gemini-3.5-flash-lite': 'gemini/gemini-3.1-flash-lite',
      'gemini-pro': 'gemini/gemini-3.1-pro-preview',
      'gemini-flash-lite': 'gemini/gemini-3.1-flash-lite',
      gpt: 'openrouter/openai/gpt-4o',
      'gpt-4o': 'openrouter/openai/gpt-4o',
      deepseek: 'openrouter/deepseek/deepseek-r1',
      llama: 'openrouter/meta-llama/llama-3.3-70b-instruct',
      mistral: 'openrouter/mistralai/mistral-large-2411',
    }

    const mappedTarget = aliasMap[cleanId]
    if (mappedTarget) {
      found =
        catalog.models.find((m) => m.id === mappedTarget) ||
        catalog.models.find((m) => m.id.includes(cleanId) || m.providerModelId.includes(cleanId))
    }
  }

  // 4. Partial substring or providerModelId search
  if (!found) {
    found = catalog.models.find(
      (m) =>
        m.providerModelId.toLowerCase() === cleanId ||
        m.name.toLowerCase() === cleanId ||
        m.id.toLowerCase().endsWith(`/${cleanId}`) ||
        m.id.toLowerCase().includes(`/${cleanId}`)
    )
  }

  if (!found) {
    throw new Error(
      `Model "${modelId}" is not available in the dynamic catalog. Please select an available model.`
    )
  }

  if (!found.isAvailable) {
    throw new Error(`Model "${found.name}" is currently marked unavailable by the provider.`)
  }

  return { model: found, recommendedActualModel: found }
}
