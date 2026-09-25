export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { jsonSuccess, jsonError } from '@/lib/auth/server'
import { getPublicModelList } from '@/lib/ai/models'
import { getModelCatalog } from '@/lib/ai/catalog'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const refresh = searchParams.get('refresh') === 'true'

    const data = await getPublicModelList(refresh)
    const catalog = await getModelCatalog()

    return jsonSuccess({
      models: data.models,
      rawModels: data.rawModels,
      defaultModelId: data.defaultModelId,
      lastRefreshed: data.lastRefreshed,
      providersStatus: catalog.providersStatus,
    })
  } catch (err: unknown) {
    const error = err as Error
    console.error('[Models API Error]:', error)
    return jsonError(error.message || 'Failed to retrieve model catalog', 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await getPublicModelList(true)
    const catalog = await getModelCatalog()

    return jsonSuccess({
      success: true,
      message: 'Model catalog refreshed successfully',
      models: data.models,
      rawModels: data.rawModels,
      defaultModelId: data.defaultModelId,
      lastRefreshed: data.lastRefreshed,
      providersStatus: catalog.providersStatus,
    })
  } catch (err: unknown) {
    const error = err as Error
    console.error('[Models Refresh Error]:', error)
    return jsonError(error.message || 'Failed to refresh model catalog', 500)
  }
}
