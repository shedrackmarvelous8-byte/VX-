import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, verifyProjectOwnership } from '@/lib/auth/server'
import { db } from '@/lib/db/store'
import {
  generateCreativeScript,
  generateProjectAudio,
  generateProjectImage,
  uploadUserProjectMedia,
} from '@/lib/media/service'
import { enforceRateLimit } from '@/lib/security/rate-limit'
import { formatSafeErrorMessage } from '@/lib/security/redact'
import { sanitizeFilename } from '@/lib/security/validation'

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024 // 50MB limit

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
  const fileType = searchParams.get('fileType') || 'all'
  const sourceType = searchParams.get('sourceType') || 'all'
  const search = searchParams.get('search') || ''

  try {
    const media = await db.listProjectMedia(projectId, auth.user.id, {
      fileType,
      sourceType,
      search,
    })
    return NextResponse.json({ media })
  } catch (err: unknown) {
    return NextResponse.json({ error: formatSafeErrorMessage(err, 'Failed to list media') }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req)
  if (auth.errorResponse) return auth.errorResponse

  // 1. Enforce media creation rate limits
  const rateLimitResponse = enforceRateLimit(req, 'media', auth.user.id)
  if (rateLimitResponse) return rateLimitResponse

  const { id: projectId } = await context.params
  const project = await verifyProjectOwnership(auth.user.id, projectId)
  if (!project) {
    return NextResponse.json({ error: 'Project not found or access denied' }, { status: 404 })
  }

  try {
    const contentType = req.headers.get('content-type') || ''

    // Handle Multipart Form Upload
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      const file = formData.get('file') as File | null
      const displayName = formData.get('displayName') as string | null
      const isReference = formData.get('isReference') === 'true'

      if (!file) {
        return NextResponse.json({ error: 'File is required' }, { status: 400 })
      }

      if (file.size > MAX_UPLOAD_BYTES) {
        return NextResponse.json(
          { error: `File size exceeds 50MB limit (${(file.size / 1024 / 1024).toFixed(1)}MB)` },
          { status: 413 }
        )
      }

      const safeName = sanitizeFilename(file.name)
      const buffer = Buffer.from(await file.arrayBuffer())
      const media = await uploadUserProjectMedia({
        projectId,
        userId: auth.user.id,
        filename: safeName,
        buffer,
        displayName: displayName || safeName,
        mimeType: file.type || 'application/octet-stream',
        referenceForGeneration: isReference,
      })

      return NextResponse.json({ success: true, media })
    }

    // Handle JSON Generation Requests
    const body = await req.json()
    const { action = 'image', prompt, modelId, ...options } = body

    if (action === 'script') {
      const script = await generateCreativeScript({
        projectId,
        userId: auth.user.id,
        prompt,
        format: options.format,
        tone: options.tone,
        length: options.length,
        audience: options.audience,
        customInstructions: options.customInstructions,
        modelId,
      })
      return NextResponse.json({ success: true, media: script })
    }

    if (action === 'image') {
      const image = await generateProjectImage({
        projectId,
        userId: auth.user.id,
        prompt,
        modelId,
        aspectRatio: options.aspectRatio,
        quality: options.quality,
        referenceMediaId: options.referenceMediaId,
        parentMediaId: options.parentMediaId,
      })
      return NextResponse.json({ success: true, media: image })
    }

    if (action === 'audio') {
      const audio = await generateProjectAudio({
        projectId,
        userId: auth.user.id,
        text: prompt || options.text,
        modelId,
        voice: options.voice,
        language: options.language,
        style: options.style,
      })
      return NextResponse.json({ success: true, media: audio })
    }

    return NextResponse.json({ error: `Unsupported creation action '${action}'` }, { status: 400 })
  } catch (err: unknown) {
    return NextResponse.json({ error: formatSafeErrorMessage(err, 'Media creation failed') }, { status: 500 })
  }
}
