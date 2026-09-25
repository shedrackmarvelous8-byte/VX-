import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, verifyProjectOwnership } from '@/lib/auth/server'
import { deployToVercel } from '@/lib/vercel/service'

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
    const body = await req.json().catch(() => ({}))
    const { target, syncEnvVars, commitMessage } = body

    const deployment = await deployToVercel(auth.user.id, projectId, {
      target: target || 'production',
      syncEnvVars: typeof syncEnvVars === 'boolean' ? syncEnvVars : true,
      commitMessage,
    })

    return NextResponse.json({
      success: true,
      deployment,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Deployment to Vercel failed' },
      { status: 400 }
    )
  }
}
