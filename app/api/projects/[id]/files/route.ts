export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { jsonError, jsonSuccess, requireAuth } from '@/lib/auth/server'
import { db } from '@/lib/db/store'
import { sanitizeProjectPath, PathValidationError, getFileName, getMimeType } from '@/lib/filesystem/path'

interface RouteContext {
  params: Promise<{ id: string }>
}

// GET /api/projects/:id/files - List or read file(s)
export async function GET(req: NextRequest, context: RouteContext) {
  const authResult = await requireAuth(req)
  if ('errorResponse' in authResult) return authResult.errorResponse

  try {
    const { id: projectId } = await context.params
    const project = await db.findProjectById(projectId)
    if (!project || project.user_id !== authResult.user.id) {
      return jsonError('Project not found or access denied', 404)
    }

    const { searchParams } = new URL(req.url)
    const filePath = searchParams.get('path')
    const searchQuery = searchParams.get('search')

    // Keyword search across files
    if (searchQuery) {
      const results = await db.searchProjectFiles(projectId, searchQuery)
      return jsonSuccess({ files: results })
    }

    // Specific file read
    if (filePath) {
      try {
        const safePath = sanitizeProjectPath(filePath)
        const file = await db.getProjectFileByPath(projectId, safePath)
        if (!file) {
          return jsonError('File not found', 404)
        }
        return jsonSuccess({ file })
      } catch (err) {
        if (err instanceof PathValidationError) {
          return jsonError(err.message, 400)
        }
        throw err
      }
    }

    // List all files in project
    const files = await db.listProjectFiles(projectId)
    return jsonSuccess({ files })
  } catch (err: unknown) {
    const error = err as Error
    return jsonError(error.message || 'Failed to retrieve project files', 500)
  }
}

// POST /api/projects/:id/files - Create or update file/folder
export async function POST(req: NextRequest, context: RouteContext) {
  const authResult = await requireAuth(req)
  if ('errorResponse' in authResult) return authResult.errorResponse

  try {
    const { id: projectId } = await context.params
    const project = await db.findProjectById(projectId)
    if (!project || project.user_id !== authResult.user.id) {
      return jsonError('Project not found or access denied', 404)
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return jsonError('Invalid request payload', 400)
    }

    const {
      path: rawPath,
      content = '',
      isFolder = false,
      expectedVersion,
      action,
      oldPath,
      newPath,
    } = body

    // Support rename / move action
    if (action === 'rename' || action === 'move') {
      if (!oldPath || !newPath) {
        return jsonError('Both oldPath and newPath are required for rename/move', 400)
      }
      const safeOld = sanitizeProjectPath(String(oldPath))
      const safeNew = sanitizeProjectPath(String(newPath))
      const newName = getFileName(safeNew)

      const moved = await db.renameOrMoveProjectFile(projectId, safeOld, safeNew, newName)
      return jsonSuccess({ file: moved, message: 'File renamed/moved successfully' })
    }

    if (!rawPath) {
      return jsonError('File path is required', 400)
    }

    const safePath = sanitizeProjectPath(String(rawPath))
    const name = getFileName(safePath)
    const mimeType = isFolder ? 'folder' : getMimeType(safePath)

    const file = await db.createOrUpdateProjectFile({
      projectId,
      userId: authResult.user.id,
      path: safePath,
      name,
      content: typeof content === 'string' ? content : '',
      isFolder: Boolean(isFolder),
      mimeType,
      expectedVersion: typeof expectedVersion === 'number' ? expectedVersion : undefined,
    })

    return jsonSuccess({ file, message: 'File saved successfully' }, 201)
  } catch (err: unknown) {
    const error = err as Error
    if (error instanceof PathValidationError) {
      return jsonError(error.message, 400)
    }
    if (error.message.includes('Conflict error')) {
      return jsonError(error.message, 409)
    }
    return jsonError(error.message || 'Failed to save project file', 500)
  }
}

// DELETE /api/projects/:id/files - Delete file or directory
export async function DELETE(req: NextRequest, context: RouteContext) {
  const authResult = await requireAuth(req)
  if ('errorResponse' in authResult) return authResult.errorResponse

  try {
    const { id: projectId } = await context.params
    const project = await db.findProjectById(projectId)
    if (!project || project.user_id !== authResult.user.id) {
      return jsonError('Project not found or access denied', 404)
    }

    const { searchParams } = new URL(req.url)
    const filePath = searchParams.get('path')
    if (!filePath) {
      return jsonError('path parameter is required', 400)
    }

    const safePath = sanitizeProjectPath(filePath)
    const success = await db.deleteProjectFile(projectId, safePath)

    if (!success) {
      return jsonError('File not found or already deleted', 404)
    }

    return jsonSuccess({ message: `Deleted ${safePath}` })
  } catch (err: unknown) {
    const error = err as Error
    if (err instanceof PathValidationError) {
      return jsonError(err.message, 400)
    }
    return jsonError(error.message || 'Failed to delete file', 500)
  }
}
