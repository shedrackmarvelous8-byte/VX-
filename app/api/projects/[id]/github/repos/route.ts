import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, verifyProjectOwnership } from '@/lib/auth/server'
import { createRepo, listUserRepos } from '@/lib/github/service'

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
  const page = parseInt(searchParams.get('page') || '1', 10)

  try {
    const repos = await listUserRepos(auth.user.id, page)
    return NextResponse.json({ repos })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to list repositories' }, { status: 500 })
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
    const { name, description, isPrivate } = await req.json()
    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Repository name is required' }, { status: 400 })
    }

    const repo = await createRepo(auth.user.id, {
      name: name.trim(),
      description: description?.trim(),
      isPrivate: Boolean(isPrivate),
    })

    return NextResponse.json({ success: true, repo })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to create repository' }, { status: 500 })
  }
}
