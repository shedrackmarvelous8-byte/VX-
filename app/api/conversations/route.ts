export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { jsonError, jsonSuccess, requireAuth } from '@/lib/auth/server'
import { db } from '@/lib/db/store'

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req)
  if ('errorResponse' in authResult) return authResult.errorResponse

  try {
    const { searchParams } = new URL(req.url)
    const projectId = searchParams.get('projectId') || undefined
    const includeArchived = searchParams.get('includeArchived') === 'true'
    const limitParam = searchParams.get('limit')
    const offsetParam = searchParams.get('offset')

    const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10) || 50), 100) : 50
    const offset = offsetParam ? Math.max(0, parseInt(offsetParam, 10) || 0) : 0

    // If projectId is provided, verify user owns it
    if (projectId) {
      const project = await db.findProjectById(projectId)
      if (!project || project.user_id !== authResult.user.id) {
        return jsonError('Project not found or access denied', 404)
      }
    }

    const conversations = await db.listConversationsByUser(authResult.user.id, {
      projectId,
      includeArchived,
      limit,
      offset,
    })

    return jsonSuccess({ conversations })
  } catch (err: unknown) {
    const error = err as Error
    console.error('[Conversations API] Error listing conversations:', error)
    return jsonError('Failed to fetch conversations', 500)
  }
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(req)
  if ('errorResponse' in authResult) return authResult.errorResponse

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return jsonError('Invalid request body', 400)
    }

    let { projectId, title } = body

    // If projectId is not specified or invalid, use user's first project or create default
    if (!projectId || typeof projectId !== 'string') {
      const userProjects = await db.listProjectsByUser(authResult.user.id)
      if (userProjects.length > 0) {
        projectId = userProjects[0].id
      } else {
        const newProj = await db.createProject({
          userId: authResult.user.id,
          name: 'My Workspace',
          description: 'Primary project',
        })
        projectId = newProj.id
      }
    } else {
      // Verify project ownership
      const project = await db.findProjectById(projectId)
      if (!project || project.user_id !== authResult.user.id) {
        return jsonError('Project not found or access denied', 404)
      }
    }

    const cleanTitle = typeof title === 'string' && title.trim() ? title.trim() : 'New chat'

    const conversation = await db.createConversation({
      userId: authResult.user.id,
      projectId,
      title: cleanTitle,
    })

    return jsonSuccess({ conversation, message: 'Conversation created successfully' }, 201)
  } catch (err: unknown) {
    const error = err as Error
    console.error('[Conversations API] Error creating conversation:', error)
    return jsonError('Failed to create conversation', 500)
  }
}
