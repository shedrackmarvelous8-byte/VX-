/**
 * Strict path security and normalization utilities for VX Project File System.
 * Ensures zero path traversal, no host filesystem escapes, and absolute isolation per project.
 */

export class PathValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PathValidationError'
  }
}

/**
 * Normalizes and sanitizes a relative project file path.
 * Returns a canonical path without leading/trailing slashes or redundant dot segments.
 * Throws PathValidationError if traversal or invalid characters are detected.
 */
export function sanitizeProjectPath(inputPath: string): string {
  if (typeof inputPath !== 'string' || !inputPath.trim()) {
    throw new PathValidationError('Path cannot be empty')
  }

  // Prevent null bytes
  if (inputPath.includes('\0')) {
    throw new PathValidationError('Path contains illegal null byte characters')
  }

  // Convert backslashes to forward slashes
  let normalized = inputPath.replace(/\\/g, '/').trim()

  // Remove leading slashes
  while (normalized.startsWith('/')) {
    normalized = normalized.slice(1)
  }

  // Remove trailing slashes unless root
  while (normalized.endsWith('/') && normalized.length > 1) {
    normalized = normalized.slice(0, -1)
  }

  if (!normalized || normalized === '.') {
    return ''
  }

  // Split path segments and check for path traversal
  const rawSegments = normalized.split('/')
  const safeSegments: string[] = []

  for (const seg of rawSegments) {
    if (seg === '' || seg === '.') {
      continue
    }
    if (seg === '..') {
      throw new PathValidationError('Path traversal attempt detected ("..")')
    }
    // Block system absolute path signatures or illegal characters
    if (/^([a-zA-Z]:|\$)/.test(seg)) {
      throw new PathValidationError(`Forbidden drive specifier or variable in path: "${seg}"`)
    }
    safeSegments.push(seg)
  }

  const finalPath = safeSegments.join('/')

  // Extra check for system paths or escapes
  if (
    finalPath.startsWith('etc/') ||
    finalPath.startsWith('var/') ||
    finalPath.startsWith('usr/') ||
    finalPath.startsWith('proc/') ||
    finalPath.startsWith('node_modules/')
  ) {
    throw new PathValidationError(`Access to reserved path "${finalPath}" is strictly forbidden`)
  }

  return finalPath
}

/**
 * Extracts directory path from a clean file path.
 * e.g., "src/components/Header.tsx" -> "src/components"
 */
export function getParentFolderPath(filePath: string): string {
  const clean = sanitizeProjectPath(filePath)
  const lastSlashIndex = clean.lastIndexOf('/')
  if (lastSlashIndex === -1) return ''
  return clean.slice(0, lastSlashIndex)
}

/**
 * Extracts file name from a clean path.
 * e.g., "src/components/Header.tsx" -> "Header.tsx"
 */
export function getFileName(filePath: string): string {
  const clean = sanitizeProjectPath(filePath)
  const lastSlashIndex = clean.lastIndexOf('/')
  if (lastSlashIndex === -1) return clean
  return clean.slice(lastSlashIndex + 1)
}

/**
 * Derives MIME type based on file extension.
 */
export function getMimeType(filePath: string): string {
  const name = getFileName(filePath).toLowerCase()
  if (name.endsWith('.json')) return 'application/json'
  if (name.endsWith('.js') || name.endsWith('.mjs') || name.endsWith('.cjs')) return 'application/javascript'
  if (name.endsWith('.ts') || name.endsWith('.tsx')) return 'text/typescript'
  if (name.endsWith('.html') || name.endsWith('.htm')) return 'text/html'
  if (name.endsWith('.css')) return 'text/css'
  if (name.endsWith('.md')) return 'text/markdown'
  if (name.endsWith('.svg')) return 'image/svg+xml'
  if (name.endsWith('.png')) return 'image/png'
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg'
  if (name.endsWith('.webp')) return 'image/webp'
  return 'text/plain'
}
