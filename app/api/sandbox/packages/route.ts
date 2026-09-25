export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getAuthenticatedUser, jsonError, jsonSuccess } from '@/lib/auth/server'
import { getProjectPackages, installPackage } from '@/lib/sandbox/package-manager'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return jsonError('projectId query parameter is required', 400)
    }

    const packages = await getProjectPackages(projectId)
    return jsonSuccess({ packages })
  } catch (err: unknown) {
    const error = err as Error
    return jsonError(`Failed to get packages: ${error.message}`, 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req)
    const userId = user?.id || 'workspace-user'

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return jsonError('Invalid request body', 400)
    }

    const { projectId, packageName, dev, version } = body

    if (!projectId || typeof projectId !== 'string') {
      return jsonError('projectId is required', 400)
    }

    if (!packageName || typeof packageName !== 'string') {
      return jsonError('packageName is required', 400)
    }

    const result = await installPackage({
      projectId,
      userId,
      packageName,
      dev: Boolean(dev),
      version: typeof version === 'string' ? version : undefined,
    })

    if (!result.success) {
      return jsonError(result.error || 'Package installation failed', 400, { result })
    }

    return jsonSuccess({
      success: true,
      result,
      message: `Package "${packageName}" installed successfully`,
    })
  } catch (err: unknown) {
    const error = err as Error
    return jsonError(`Package installation failed: ${error.message}`, 500)
  }
}
