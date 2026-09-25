export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { jsonError, jsonSuccess, requireAuth } from '@/lib/auth/server'
import { db } from '@/lib/db/store'

interface RouteContext {
  params: Promise<{ jobId: string }>
}

export async function GET(req: NextRequest, context: RouteContext) {
  const authResult = await requireAuth(req)
  if ('errorResponse' in authResult) return authResult.errorResponse

  const { jobId } = await context.params
  const job = await db.getAndroidBuildJob(jobId, authResult.user.id)

  if (!job) {
    return jsonError('Build job not found or access denied', 404)
  }

  return jsonSuccess({ job })
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const authResult = await requireAuth(req)
  if ('errorResponse' in authResult) return authResult.errorResponse

  const { jobId } = await context.params
  const job = await db.getAndroidBuildJob(jobId, authResult.user.id)

  if (!job) {
    return jsonError('Build job not found or access denied', 404)
  }

  if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
    return jsonError(`Cannot cancel job in status "${job.status}"`, 400)
  }

  const updated = await db.updateAndroidBuildJob(jobId, {
    status: 'cancelled',
    completed_at: new Date().toISOString(),
    logMessage: 'Build job cancelled by user.',
  })

  return jsonSuccess({ job: updated, message: 'Build job cancelled successfully' })
}
