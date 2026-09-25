import { NextRequest, NextResponse } from 'next/server'
import { db } from '../db/store'
import type { ProjectRecord, UserProfile } from '../db/types'

export const SESSION_COOKIE_NAME = 'vx_session'
export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

/**
 * Extracts session token from incoming request cookies or Authorization header.
 */
export function getAuthTokenFromRequest(req: NextRequest): string | null {
  // 1. Check Authorization: Bearer <token>
  const authHeader = req.headers.get('authorization')
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.substring(7).trim()
    if (bearer) return bearer
  }

  // 2. Check X-Session-Token header
  const xToken = req.headers.get('x-session-token')
  if (xToken) return xToken.trim()

  // 3. Check HTTP-only cookie
  const cookieToken = req.cookies.get(SESSION_COOKIE_NAME)?.value
  if (cookieToken) return cookieToken

  return null
}

/**
 * Validates session and returns the authenticated user profile, or null.
 */
export async function getAuthenticatedUser(req: NextRequest): Promise<UserProfile | null> {
  const token = getAuthTokenFromRequest(req)
  if (!token) return null

  const sessionData = await db.getSession(token)
  if (!sessionData) return null

  return sessionData.user
}

/**
 * Ensures request has an authenticated user.
 * Returns the user profile or an error response if unauthorized.
 */
export async function requireAuth(
  req: NextRequest
): Promise<{ user: UserProfile; errorResponse?: never } | { errorResponse: NextResponse; user?: never }> {
  const user = await getAuthenticatedUser(req)
  if (!user) {
    return {
      errorResponse: NextResponse.json(
        { error: 'Unauthorized: Authentication required to access this resource' },
        { status: 401 }
      ),
    }
  }
  return { user }
}

/**
 * Ensures request has an authenticated AND email-verified user.
 */
export async function requireVerifiedAuth(
  req: NextRequest
): Promise<{ user: UserProfile; errorResponse?: never } | { errorResponse: NextResponse; user?: never }> {
  const authResult = await requireAuth(req)
  if (authResult.errorResponse) {
    return authResult
  }

  if (!authResult.user.email_verified) {
    return {
      errorResponse: NextResponse.json(
        {
          error: 'Email verification required: Please verify your email address to perform this action.',
          requiresVerification: true,
          email: authResult.user.email,
        },
        { status: 403 }
      ),
    }
  }

  return authResult
}

/**
 * Verifies that the given project belongs to the user to prevent IDOR attacks.
 */
export async function verifyProjectOwnership(
  userId: string,
  projectId: string
): Promise<ProjectRecord | null> {
  const project = await db.findProjectById(projectId)
  if (!project || project.user_id !== userId) {
    return null
  }
  return project
}

/**
 * Creates response cookie options for the session token.
 */
export function setSessionCookie(response: NextResponse, token: string, expiresAt: Date): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
    expires: expiresAt,
  })
}

/**
 * Clears the session cookie on logout.
 */
export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  })
}

/**
 * Standard JSON error response helper.
 */
export function jsonError(message: string, status = 400, details?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...(details ? details : {}) }, { status })
}

/**
 * Standard JSON success response helper.
 */
export function jsonSuccess(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}
