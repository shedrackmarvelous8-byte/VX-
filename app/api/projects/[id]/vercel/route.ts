import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, verifyProjectOwnership } from '@/lib/auth/server'
import {
  detectFramework,
  getProjectVercelConfig,
  saveProjectVercelConfig,
} from '@/lib/vercel/service'

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
    const config = getProjectVercelConfig(projectId)
    const detectedFramework = await detectFramework(projectId)
    return NextResponse.json({
      config,
      detectedFramework,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to get Vercel config' }, { status: 500 })
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
    const { vercelProjectName, framework, syncEnvVars } = body

    const updated = saveProjectVercelConfig(projectId, {
      vercelProjectName: vercelProjectName?.trim(),
      framework,
      syncEnvVars: typeof syncEnvVars === 'boolean' ? syncEnvVars : true,
    })

    return NextResponse.json({ success: true, config: updated })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to update Vercel config' }, { status: 500 })
  }
}
