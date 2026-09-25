export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { jsonError, jsonSuccess, requireAuth } from '@/lib/auth/server'
import { db } from '@/lib/db/store'

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req)
  if ('errorResponse' in authResult) return authResult.errorResponse

  try {
    const projects = await db.listProjectsByUser(authResult.user.id)
    return jsonSuccess({ projects })
  } catch (err: unknown) {
    const error = err as Error
    console.error('Error fetching projects:', error)
    return jsonError('Failed to fetch projects', 500)
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

    const { name, description, stack, target } = body
    if (!name || typeof name !== 'string' || !name.trim()) {
      return jsonError('Project name is required', 400)
    }

    const validTarget = ['web', 'mobile', 'web_mobile'].includes(target) ? target : 'web'

    const project = await db.createProject({
      userId: authResult.user.id,
      name: name.trim(),
      description: typeof description === 'string' ? description.trim() : undefined,
      stack: typeof stack === 'string' ? stack.trim() : (validTarget === 'mobile' ? 'Expo · React Native' : 'Next.js'),
      target: validTarget,
    })

    return jsonSuccess({ project, message: 'Project created successfully' }, 201)
  } catch (err: unknown) {
    const error = err as Error
    console.error('Error creating project:', error)
    return jsonError('Failed to create project', 500)
  }
}
