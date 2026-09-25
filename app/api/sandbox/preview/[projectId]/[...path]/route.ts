export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { handlePreviewRequest } from '@/lib/sandbox/preview-handler'

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ projectId: string; path: string[] }> }
) {
  const { projectId, path: pathSegments } = await context.params
  const subpath = Array.isArray(pathSegments) ? pathSegments.join('/') : ''
  return handlePreviewRequest(req, projectId, subpath)
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ projectId: string; path: string[] }> }
) {
  const { projectId, path: pathSegments } = await context.params
  const subpath = Array.isArray(pathSegments) ? pathSegments.join('/') : ''
  return handlePreviewRequest(req, projectId, subpath)
}
