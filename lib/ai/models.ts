import {
  getModelCatalog,
  resolveCatalogModel,
  AUTO_MODEL_ID,
  AUTO_MODEL_DEFINITION,
} from './catalog'
import type { DiscoveredModel, AIProvider, ModelCapabilities } from './discovery'
import type { ModelInfo } from '@/src/types/chat'

export type { DiscoveredModel, AIProvider, ModelCapabilities }
export { AUTO_MODEL_ID, AUTO_MODEL_DEFINITION }

export type ModelDefinition = DiscoveredModel
export const DEFAULT_MODEL_ID = AUTO_MODEL_ID

/**
 * Returns public dynamic model catalog formatted for the frontend Model Selector.
 */
export async function getPublicModelList(forceRefresh = false): Promise<{
  models: ModelInfo[]
  rawModels: DiscoveredModel[]
  defaultModelId: string
  lastRefreshed: number
}> {
  const catalog = await getModelCatalog(forceRefresh)

  const publicModels: ModelInfo[] = catalog.models
    .filter((m) => m.isAvailable)
    .map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      badges: m.badges,
      group: m.group === 'recommended' ? 'recommended' : 'more',
    }))

  return {
    models: publicModels,
    rawModels: catalog.models,
    defaultModelId: DEFAULT_MODEL_ID,
    lastRefreshed: catalog.lastRefreshed,
  }
}

/**
 * Resolves a model ID using the dynamic catalog.
 */
export async function findModelById(id: string): Promise<DiscoveredModel | null> {
  try {
    const res = await resolveCatalogModel(id)
    return res.model
  } catch {
    return null
  }
}
