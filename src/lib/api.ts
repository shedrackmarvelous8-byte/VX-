/**
 * Universal authenticated fetch utility.
 * Guarantees requests are authenticated in all environments,
 * including iframes where third-party cookies might be restricted.
 */
export const AUTH_TOKEN_KEY = 'vx_auth_token'

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY)
  } catch {
    return null
  }
}

export function setAuthToken(token: string | null): void {
  if (typeof window === 'undefined') return
  try {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token)
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY)
    }
  } catch {
    // Ignore storage restrictions
  }
}

export async function authFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const token = getAuthToken()
  const headers = new Headers(init?.headers || {})

  if (token) {
    if (!headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`)
    }
    if (!headers.has('X-Session-Token')) {
      headers.set('X-Session-Token', token)
    }
  }

  return fetch(input, {
    ...init,
    headers,
  })
}
