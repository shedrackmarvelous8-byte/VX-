import path from 'path'

/**
 * Validates a file path to prevent directory traversal and null-byte injection.
 * Returns normalized relative path if valid, or null if malicious.
 */
export function validateSafeFilePath(inputPath: string): string | null {
  if (!inputPath || typeof inputPath !== 'string') return null

  // Check for null bytes
  if (inputPath.includes('\0')) return null

  // Reject explicit directory traversal tokens
  if (
    inputPath.includes('../') ||
    inputPath.includes('..\\') ||
    inputPath === '..' ||
    inputPath.startsWith('../') ||
    inputPath.startsWith('..')
  ) {
    return null
  }

  // Normalize path
  const normalized = path.normalize(inputPath)

  // Prevent directory traversal after normalization
  if (normalized.startsWith('..') || normalized.includes('/../') || normalized.includes('\\..\\')) {
    return null
  }

  // Prevent Windows drive letters or malformed absolute escapes
  if (/^[a-zA-Z]:/.test(normalized)) {
    return null
  }

  // Clean leading slash for consistency in project relative trees
  return normalized.replace(/^\/+/, '')
}

/**
 * Validates project ID format (alphanumeric, dashes, underscores).
 */
export function isValidProjectId(projectId: string): boolean {
  if (!projectId || typeof projectId !== 'string') return false
  if (projectId.length > 128) return false
  return /^[a-zA-Z0-9_-]+$/.test(projectId)
}

/**
 * Validates environment variable key name (POSIX standard identifier).
 */
export function isValidEnvKey(key: string): boolean {
  if (!key || typeof key !== 'string') return false
  if (key.length > 256) return false
  return /^[A-Z_][A-Z0-9_]*$/i.test(key)
}

/**
 * Validates safe uploaded filename.
 */
export function sanitizeFilename(filename: string): string {
  if (!filename || typeof filename !== 'string') return 'unnamed_file'

  // Strip path segments
  const basename = path.basename(filename)

  // Remove dangerous characters and keep safe alphanumeric, dots, dashes, underscores
  const cleaned = basename.replace(/[^a-zA-Z0-9._-]/g, '_')

  // Truncate to 180 chars
  return cleaned.slice(0, 180) || 'file'
}

/**
 * Validates request payload size in bytes.
 */
export function validateRequestSize(contentLength: number | null, maxBytes: number): boolean {
  if (contentLength === null) return true // Chunked or unspecified, rely on stream limits
  return contentLength <= maxBytes
}

/**
 * Sanitizes plain string input (trims, removes control characters).
 */
export function sanitizeString(input: unknown, maxLength = 1000): string {
  if (typeof input !== 'string') return ''
  // Strip control characters except newline and tab
  const stripped = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
  return stripped.trim().slice(0, maxLength)
}
