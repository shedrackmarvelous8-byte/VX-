import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, verifyProjectOwnership } from '@/lib/auth/server'
import { getCreationModels } from '@/lib/media/service'
import type { GenerationType } from '@/lib/db/types'

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req)
  if (auth.errorResponse) return auth.errorResponse

  const { id: projectId } = await context.params
  const project = await verifyProjectOwnership(auth.user.id, projectId)
  if (!project) {
    return NextResponse.json({ error: 'Project not found or access denied' }, { status: 404 })
  }

  const { searchParams } = new URL(req.url)
  const category = (searchParams.get('category') || 'image') as GenerationType

  try {
    const models = await getCreationModels(category)
    return NextResponse.json({ models })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to list models' }, { status: 500 })
  }
}
