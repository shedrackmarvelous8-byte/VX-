import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, verifyProjectOwnership } from '@/lib/auth/server'
import { reviewProject } from '@/lib/intelligence/review'
import { db } from '@/lib/db/store'

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

  try {
    const review = await db.getLatestProjectReview(projectId, auth.user.id)
    return NextResponse.json({ review })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch review' }, { status: 500 })
  }
}

export async function POST(
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

  try {
    const body = await req.json().catch(() => ({}))
    const scope = body.scope || 'full'

    const review = await reviewProject(projectId, auth.user.id, scope)
    return NextResponse.json({ success: true, review })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to perform project review' }, { status: 500 })
  }
}
