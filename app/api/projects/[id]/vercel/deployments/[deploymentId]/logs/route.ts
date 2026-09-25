import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, verifyProjectOwnership } from '@/lib/auth/server'
import { getDeploymentLogs } from '@/lib/vercel/service'

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string; deploymentId: string }> }
) {
  const auth = await requireAuth(req)
  if (auth.errorResponse) return auth.errorResponse

  const { id: projectId, deploymentId } = await context.params
  const project = await verifyProjectOwnership(auth.user.id, projectId)
  if (!project) {
    return NextResponse.json({ error: 'Project not found or access denied' }, { status: 404 })
  }

  try {
    const logs = await getDeploymentLogs(auth.user.id, deploymentId)
    return NextResponse.json({ logs })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to fetch deployment logs' },
      { status: 500 }
    )
  }
}
