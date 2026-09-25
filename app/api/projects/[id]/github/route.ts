import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, verifyProjectOwnership } from '@/lib/auth/server'
import {
  getProjectGitStatus,
  linkProjectRepo,
  unlinkProjectRepo,
} from '@/lib/github/service'

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
    const status = await getProjectGitStatus(auth.user.id, projectId)
    return NextResponse.json(status)
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to get git status' }, { status: 500 })
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
    const { action, repoFullName, branch, isPrivate } = body

    if (action === 'unlink') {
      unlinkProjectRepo(projectId)
      return NextResponse.json({ success: true, linked: false })
    }

    if (!repoFullName) {
      return NextResponse.json({ error: 'Repository name is required' }, { status: 400 })
    }

    const link = linkProjectRepo(projectId, {
      repoFullName,
      branch: branch || 'main',
      isPrivate: Boolean(isPrivate),
    })

    return NextResponse.json({ success: true, link })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to link repository' }, { status: 500 })
  }
}
