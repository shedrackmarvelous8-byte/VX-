import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, verifyProjectOwnership } from '@/lib/auth/server'
import { db } from '@/lib/db/store'
import { startVideoGenerationJob } from '@/lib/media/service'

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
    const jobs = await db.listGenerationJobs(projectId, auth.user.id)
    return NextResponse.json({ jobs })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to list jobs' }, { status: 500 })
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
    const body = await req.json()
    const { prompt, modelId, duration, aspectRatio, resolution, referenceMediaId } = body

    const job = await startVideoGenerationJob({
      projectId,
      userId: auth.user.id,
      prompt,
      modelId,
      duration,
      aspectRatio,
      resolution,
      referenceMediaId,
    })

    return NextResponse.json({ success: true, job })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to start generation job' }, { status: 500 })
  }
}
