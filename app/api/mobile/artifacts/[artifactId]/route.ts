export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { jsonError, jsonSuccess, requireAuth } from '@/lib/auth/server'
import { db } from '@/lib/db/store'

interface RouteContext {
  params: Promise<{ artifactId: string }>
}

export async function GET(req: NextRequest, context: RouteContext) {
  const authResult = await requireAuth(req)
  if ('errorResponse' in authResult) return authResult.errorResponse

  const { artifactId } = await context.params
  const artifact = await db.getProjectArtifact(artifactId, authResult.user.id)

  if (!artifact) {
    return jsonError('Artifact not found or access denied', 404)
  }

  const existingShareLink = await db.getShareableLinkByArtifact(artifactId, authResult.user.id)

  return jsonSuccess({ artifact, shareLink: existingShareLink })
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const authResult = await requireAuth(req)
  if ('errorResponse' in authResult) return authResult.errorResponse

  const { artifactId } = await context.params
  const success = await db.updateProjectArtifactStatus(artifactId, authResult.user.id, 'deleted')

  if (!success) {
    return jsonError('Artifact not found or access denied', 404)
  }

  // Revoke share links if present
  const existingShareLink = await db.getShareableLinkByArtifact(artifactId, authResult.user.id)
  if (existingShareLink) {
    await db.revokeShareableLink(existingShareLink.id, authResult.user.id)
  }

  return jsonSuccess({ message: 'Artifact deleted successfully' })
}

export async function POST(req: NextRequest, context: RouteContext) {
  const authResult = await requireAuth(req)
  if ('errorResponse' in authResult) return authResult.errorResponse

  const { artifactId } = await context.params
  const artifact = await db.getProjectArtifact(artifactId, authResult.user.id)

  if (!artifact) {
    return jsonError('Artifact not found or access denied', 404)
  }

  const body = await req.json().catch(() => null)
  const action = body?.action || 'create_share_link'

  if (action === 'revoke') {
    const existingShareLink = await db.getShareableLinkByArtifact(artifactId, authResult.user.id)
    if (existingShareLink) {
      await db.revokeShareableLink(existingShareLink.id, authResult.user.id)
    }
    return jsonSuccess({ message: 'Share link revoked successfully' })
  }

  let shareLink = await db.getShareableLinkByArtifact(artifactId, authResult.user.id)
  if (!shareLink) {
    shareLink = await db.createShareableLink({
      artifactId,
      projectId: artifact.project_id,
      userId: authResult.user.id,
    })
  }

  const origin = req.nextUrl.origin
  const shareUrl = `${origin}/download/${shareLink.token}`

  return jsonSuccess({ shareLink, shareUrl })
}
