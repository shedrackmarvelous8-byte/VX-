import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, verifyProjectOwnership } from '@/lib/auth/server'
import { db } from '@/lib/db/store'
import { deleteMediaBuffer } from '@/lib/media/storage'

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string; mediaId: string }> }
) {
  const auth = await requireAuth(req)
  if (auth.errorResponse) return auth.errorResponse

  const { id: projectId, mediaId } = await context.params
  const project = await verifyProjectOwnership(auth.user.id, projectId)
  if (!project) {
    return NextResponse.json({ error: 'Project not found or access denied' }, { status: 404 })
  }

  const media = await db.getProjectMediaById(mediaId, auth.user.id)
  if (!media || media.project_id !== projectId) {
    return NextResponse.json({ error: 'Media asset not found' }, { status: 404 })
  }

  return NextResponse.json({ media })
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string; mediaId: string }> }
) {
  const auth = await requireAuth(req)
  if (auth.errorResponse) return auth.errorResponse

  const { id: projectId, mediaId } = await context.params
  const project = await verifyProjectOwnership(auth.user.id, projectId)
  if (!project) {
    return NextResponse.json({ error: 'Project not found or access denied' }, { status: 404 })
  }

  try {
    const body = await req.json()
    const { displayName, metadata } = body

    const updated = await db.updateProjectMedia(mediaId, auth.user.id, {
      display_name: displayName,
      metadata,
    })

    if (!updated) {
      return NextResponse.json({ error: 'Media not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, media: updated })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to update media' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string; mediaId: string }> }
) {
  const auth = await requireAuth(req)
  if (auth.errorResponse) return auth.errorResponse

  const { id: projectId, mediaId } = await context.params
  const project = await verifyProjectOwnership(auth.user.id, projectId)
  if (!project) {
    return NextResponse.json({ error: 'Project not found or access denied' }, { status: 404 })
  }

  const media = await db.getProjectMediaById(mediaId, auth.user.id)
  if (!media || media.project_id !== projectId) {
    return NextResponse.json({ error: 'Media asset not found' }, { status: 404 })
  }

  try {
    // 1. Delete binary buffer from storage
    if (media.storage_path) {
      await deleteMediaBuffer(media.storage_path).catch(() => null)
    }

    // 2. Delete record from database
    const deleted = await db.deleteProjectMedia(mediaId, auth.user.id, true)
    return NextResponse.json({ success: deleted })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to delete media' }, { status: 500 })
  }
}
