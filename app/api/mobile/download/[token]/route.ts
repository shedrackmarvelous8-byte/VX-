export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { db } from '@/lib/db/store'

interface RouteContext {
  params: Promise<{ token: string }>
}

export async function GET(req: NextRequest, context: RouteContext) {
  const { token } = await context.params

  if (!token) {
    return new NextResponse('Invalid or missing download token', { status: 400 })
  }

  // 1. Resolve share link by token
  const link = await db.getShareableLinkByToken(token)
  if (!link) {
    return new NextResponse('Download link invalid, expired, or revoked', { status: 404 })
  }

  // 2. Fetch artifact
  const artifact = await db.getProjectArtifact(link.artifact_id)
  if (!artifact || artifact.status !== 'available') {
    return new NextResponse('Requested APK artifact is no longer available', { status: 404 })
  }

  // 3. Resolve physical file path
  let relativePath = artifact.storage_path
  if (relativePath.startsWith('/')) relativePath = relativePath.slice(1)

  const filePath = path.join(process.cwd(), 'public', relativePath)

  if (!fs.existsSync(filePath)) {
    return new NextResponse('APK binary file not found on server storage', { status: 404 })
  }

  // 4. Increment download count
  await db.incrementShareableLinkDownloads(link.id)

  // 5. Stream APK binary with correct Android package headers
  const fileBuffer = fs.readFileSync(filePath)

  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Disposition': `attachment; filename="${artifact.file_name}"`,
      'Content-Length': fileBuffer.length.toString(),
      'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
