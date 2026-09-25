export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getAuthenticatedUser, jsonError, jsonSuccess } from '@/lib/auth/server'
import { db } from '@/lib/db/store'
import {
  getDevServerStatus,
  startDevServer,
  stopDevServer,
  restartDevServer,
} from '@/lib/sandbox/dev-server'

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req)
    if (!user) {
      return jsonError('Unauthorized: Authentication required', 401)
    }

    const { searchParams } = new URL(req.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return jsonError('projectId query parameter is required', 400)
    }

    const project = await db.findProjectById(projectId)
    if (!project || project.user_id !== user.id) {
      return jsonError('Project not found or access denied', 404)
    }

    const state = getDevServerStatus(projectId)
    return jsonSuccess({ state })
  } catch (err: unknown) {
    const error = err as Error
    return jsonError(`Failed to get dev server status: ${error.message}`, 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req)
    if (!user) {
      return jsonError('Unauthorized: Authentication required', 401)
    }
    const userId = user.id

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return jsonError('Invalid request body', 400)
    }

    const { projectId, action = 'start', env } = body

    if (!projectId || typeof projectId !== 'string') {
      return jsonError('projectId is required', 400)
    }

    const project = await db.findProjectById(projectId)
    if (!project || project.user_id !== user.id) {
      return jsonError('Project not found or access denied', 404)
    }

    let state
    if (action === 'start') {
      state = await startDevServer(projectId, userId, env)
    } else if (action === 'stop') {
      state = await stopDevServer(projectId)
    } else if (action === 'restart') {
      state = await restartDevServer(projectId, userId, env)
    } else {
      return jsonError(`Invalid action "${action}". Must be start, stop, or restart.`, 400)
    }

    return jsonSuccess({
      success: state.status === 'running' || state.status === 'starting' || state.status === 'stopped',
      state,
    })
  } catch (err: unknown) {
    const error = err as Error
    return jsonError(`Dev server operation failed: ${error.message}`, 500)
  }
}
