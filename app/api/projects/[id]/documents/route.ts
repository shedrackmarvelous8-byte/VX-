import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, verifyProjectOwnership } from '@/lib/auth/server'
import { db } from '@/lib/db/store'
import { generateProjectDocument } from '@/lib/intelligence/notes'

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
    const documents = await db.listDocumentAnalyses(projectId, auth.user.id)
    return NextResponse.json({ documents })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to list documents' }, { status: 500 })
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
    const { docType = 'project_brief', title, customContent } = await req.json()

    const doc = await generateProjectDocument({
      projectId,
      userId: auth.user.id,
      docType,
      title,
      customContent,
    })

    return NextResponse.json({ success: true, document: doc })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to generate document' }, { status: 500 })
  }
}
