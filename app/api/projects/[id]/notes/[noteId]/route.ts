import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, verifyProjectOwnership } from '@/lib/auth/server'
import { deleteProjectNote, updateProjectNote } from '@/lib/intelligence/notes'
import { db } from '@/lib/db/store'

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string; noteId: string }> }
) {
  const auth = await requireAuth(req)
  if (auth.errorResponse) return auth.errorResponse

  const { id: projectId, noteId } = await context.params
  const project = await verifyProjectOwnership(auth.user.id, projectId)
  if (!project) {
    return NextResponse.json({ error: 'Project not found or access denied' }, { status: 404 })
  }

  const note = await db.getProjectNoteById(noteId, auth.user.id)
  if (!note || note.project_id !== projectId) {
    return NextResponse.json({ error: 'Note not found' }, { status: 404 })
  }

  return NextResponse.json({ note })
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string; noteId: string }> }
) {
  const auth = await requireAuth(req)
  if (auth.errorResponse) return auth.errorResponse

  const { id: projectId, noteId } = await context.params
  const project = await verifyProjectOwnership(auth.user.id, projectId)
  if (!project) {
    return NextResponse.json({ error: 'Project not found or access denied' }, { status: 404 })
  }

  try {
    const body = await req.json()
    const updated = await updateProjectNote(noteId, auth.user.id, body)
    if (!updated) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true, note: updated })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to update note' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string; noteId: string }> }
) {
  const auth = await requireAuth(req)
  if (auth.errorResponse) return auth.errorResponse

  const { id: projectId, noteId } = await context.params
  const project = await verifyProjectOwnership(auth.user.id, projectId)
  if (!project) {
    return NextResponse.json({ error: 'Project not found or access denied' }, { status: 404 })
  }

  try {
    const deleted = await deleteProjectNote(noteId, auth.user.id)
    return NextResponse.json({ success: deleted })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to delete note' }, { status: 500 })
  }
}
