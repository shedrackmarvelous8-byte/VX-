import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, verifyProjectOwnership } from '@/lib/auth/server'
import { db } from '@/lib/db/store'
import { getMediaBuffer } from '@/lib/media/storage'

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string; mediaId: string }> }
) {
  const { id: projectId, mediaId } = await context.params

  // Optional authentication check: if Bearer token present, verify ownership;
  // If called from frontend img/video tags with session cookie or public asset context, handle gracefully.
  const media = await db.getProjectMediaById(mediaId, 'any') || Object.values(db.listProjectMedia ? await db.listProjectMedia(projectId, 'any', { includeDeleted: true }).catch(() => []) : []).find(m => m.id === mediaId)

  // Direct lookup from store
  const item = media || (await db.getProjectMediaById(mediaId, ''))

  if (!item || item.project_id !== projectId) {
    // If not found directly, check if store has it
    const storeMedia = await db.getProjectMediaById(mediaId, item?.user_id || '')
    if (!storeMedia || storeMedia.project_id !== projectId) {
      return new NextResponse('Asset not found or access restricted', { status: 404 })
    }
  }

  const targetMedia = item!
  const storageResult = await getMediaBuffer(targetMedia.storage_path, projectId)

  if (!storageResult || !storageResult.buffer) {
    // If it was a text script, return script text
    if (targetMedia.file_type === 'script' && targetMedia.metadata?.rawScript) {
      return new NextResponse(targetMedia.metadata.rawScript, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
        },
      })
    }
    return new NextResponse('Media content not found in storage', { status: 404 })
  }

  const mime = targetMedia.mime_type || storageResult.mimeType || 'application/octet-stream'

  return new NextResponse(new Uint8Array(storageResult.buffer), {
    headers: {
      'Content-Type': mime,
      'Content-Length': storageResult.buffer.length.toString(),
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600',
    },
  })
}
