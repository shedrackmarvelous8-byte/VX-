export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { jsonError, jsonSuccess, requireAuth, verifyProjectOwnership } from '@/lib/auth/server'
import { db } from '@/lib/db/store'
import { triggerAndroidApkBuild, validateMobileProjectForBuild } from '@/lib/mobile/build-service'

// GET /api/mobile/build?projectId=... - List build jobs or run validation
export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req)
  if ('errorResponse' in authResult) return authResult.errorResponse

  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')
  const validateOnly = searchParams.get('validateOnly') === 'true'

  if (!projectId) {
    return jsonError('projectId query parameter is required', 400)
  }

  const project = await verifyProjectOwnership(authResult.user.id, projectId)
  if (!project) {
    return jsonError('Project not found or access denied', 404)
  }

  if (validateOnly) {
    const validation = await validateMobileProjectForBuild(projectId, authResult.user.id)
    return jsonSuccess({ validation })
  }

  const jobs = await db.listAndroidBuildJobs(projectId, authResult.user.id)
  return jsonSuccess({ jobs })
}

// POST /api/mobile/build - Trigger new Android APK build job
export async function POST(req: NextRequest) {
  const authResult = await requireAuth(req)
  if ('errorResponse' in authResult) return authResult.errorResponse

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return jsonError('Invalid request body', 400)
    }

    const { projectId, version, versionCode, checkpointId } = body
    if (!projectId || typeof projectId !== 'string') {
      return jsonError('projectId is required', 400)
    }

    const project = await verifyProjectOwnership(authResult.user.id, projectId)
    if (!project) {
      return jsonError('Project not found or access denied', 404)
    }

    const job = await triggerAndroidApkBuild({
      userId: authResult.user.id,
      projectId,
      version: typeof version === 'string' ? version : undefined,
      versionCode: typeof versionCode === 'number' ? versionCode : undefined,
      checkpointId: typeof checkpointId === 'string' ? checkpointId : undefined,
    })

    return jsonSuccess({ job, message: 'Android APK build job queued successfully' }, 202)
  } catch (err: unknown) {
    const error = err as Error
    return jsonError(error.message || 'Failed to trigger Android build job', 400)
  }
}
