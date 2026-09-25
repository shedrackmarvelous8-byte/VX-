import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, verifyProjectOwnership } from '@/lib/auth/server'
import { createProjectNote, listProjectNotes } from '@/lib/intelligence/notes'

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
    const notes = await listProjectNotes(projectId, auth.user.id)
    return NextResponse.json({ notes })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to list project notes' }, { status: 500 })
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
    const { title, category = 'project_notes', content } = await req.json()
    if (!title || typeof title !== 'string') {
      return NextResponse.json({ error: 'Note title is required' }, { status: 400 })
    }

    const note = await createProjectNote({
      projectId,
      userId: auth.user.id,
      title: title.trim(),
      category,
      content: content || '',
    })

    return NextResponse.json({ success: true, note })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to create note' }, { status: 500 })
  }
}
