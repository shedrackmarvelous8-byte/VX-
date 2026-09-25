export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getAuthenticatedUser, jsonError, jsonSuccess } from '@/lib/auth/server'
import { executeSandboxCommand } from '@/lib/sandbox/command'
import { db } from '@/lib/db/store'
import { enforceRateLimit } from '@/lib/security/rate-limit'
import { formatSafeErrorMessage, redactSecrets } from '@/lib/security/redact'
import { isValidProjectId } from '@/lib/security/validation'

export async function POST(req: NextRequest) {
  // 1. Rate limiting on terminal / command execution
  const rateLimitResponse = enforceRateLimit(req, 'terminal')
  if (rateLimitResponse) return rateLimitResponse

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) {
      return jsonError('Unauthorized: Authentication required for command execution', 401)
    }
    const userId = user.id

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return jsonError('Invalid request body', 400)
    }

    const { projectId, command, timeoutMs, env } = body

    if (!projectId || typeof projectId !== 'string' || !isValidProjectId(projectId)) {
      return jsonError('Valid projectId is required', 400)
    }

    if (!command || typeof command !== 'string') {
      return jsonError('command string is required', 400)
    }

    // Verify project exists and belongs to authenticated user
    const project = await db.findProjectById(projectId)
    if (!project) {
      return jsonError('Project not found', 404)
    }

    if (project.user_id !== user.id) {
      return jsonError('Forbidden: Access to this project sandbox is restricted', 403)
    }

    const result = await executeSandboxCommand({
      projectId,
      userId,
      command,
      timeoutMs: typeof timeoutMs === 'number' ? Math.min(timeoutMs, 60000) : 30000,
      env: env && typeof env === 'object' ? env : undefined,
    })

    // Redact any platform secrets from command stdout and stderr
    const sanitizedStdout = redactSecrets(result.stdout || '')
    const sanitizedStderr = redactSecrets(result.stderr || '')
    const sanitizedError = result.error ? redactSecrets(result.error) : undefined

    return jsonSuccess({
      success: result.status === 'success',
      result: {
        ...result,
        stdout: sanitizedStdout,
        stderr: sanitizedStderr,
        error: sanitizedError,
      },
    })
  } catch (err: unknown) {
    return jsonError(formatSafeErrorMessage(err, 'Command execution failed'), 500)
  }
}
