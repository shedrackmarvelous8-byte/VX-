import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, verifyProjectOwnership } from '@/lib/auth/server'
import { getCommitHistory } from '@/lib/github/service'

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
  const limit = parseInt(searchParams.get('limit') || '20', 10)

  try {
    const commits = await getCommitHistory(auth.user.id, projectId, limit)
    return NextResponse.json({ commits })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch commit history' }, { status: 500 })
  }
}
