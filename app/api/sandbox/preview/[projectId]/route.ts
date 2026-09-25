export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { handlePreviewRequest } from '@/lib/sandbox/preview-handler'

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await context.params
  return handlePreviewRequest(req, projectId, '')
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await context.params
  return handlePreviewRequest(req, projectId, '')
}
