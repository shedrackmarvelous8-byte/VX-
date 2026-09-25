import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, verifyProjectOwnership } from '@/lib/auth/server'
import { getProjectDeployments } from '@/lib/vercel/service'

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
    const deployments = getProjectDeployments(projectId)
    return NextResponse.json({ deployments })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to list deployments' },
      { status: 500 }
    )
  }
}
