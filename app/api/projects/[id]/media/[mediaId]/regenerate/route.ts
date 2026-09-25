import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, verifyProjectOwnership } from '@/lib/auth/server'
import { db } from '@/lib/db/store'
import { generateCreativeScript, generateProjectImage } from '@/lib/media/service'

export async function POST(
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

  const existing = await db.getProjectMediaById(mediaId, auth.user.id)
  if (!existing || existing.project_id !== projectId) {
    return NextResponse.json({ error: 'Original media asset not found' }, { status: 404 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const prompt = body.prompt || existing.prompt || 'Regenerate asset'
    const modelId = body.modelId || existing.model_id || undefined

    let regenerated

    if (existing.file_type === 'script') {
      regenerated = await generateCreativeScript({
        projectId,
        userId: auth.user.id,
        prompt,
        format: existing.metadata?.format,
        tone: existing.metadata?.tone,
        length: existing.metadata?.length,
        audience: existing.metadata?.audience,
        modelId,
      })
    } else {
      regenerated = await generateProjectImage({
        projectId,
        userId: auth.user.id,
        prompt,
        modelId,
        aspectRatio: existing.metadata?.aspectRatio || '1:1',
        quality: existing.metadata?.quality || 'standard',
        parentMediaId: existing.id,
      })
    }

    return NextResponse.json({ success: true, media: regenerated })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Regeneration failed' }, { status: 500 })
  }
}
