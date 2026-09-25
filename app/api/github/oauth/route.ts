import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/server'
import { exchangeOAuthCode, getOAuthUrl } from '@/lib/github/service'

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth.errorResponse) return auth.errorResponse

  const { searchParams } = new URL(req.url)
  const state = searchParams.get('state') || `vx_${auth.user.id}`
  const info = getOAuthUrl(state)

  return NextResponse.json(info)
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth.errorResponse) return auth.errorResponse

  try {
    const { code } = await req.json()
    if (!code) {
      return NextResponse.json({ error: 'OAuth code is required' }, { status: 400 })
    }

    const user = await exchangeOAuthCode(auth.user.id, code)
    return NextResponse.json({
      success: true,
      account: {
        login: user.login,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatar_url,
        htmlUrl: user.html_url,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'OAuth exchange failed' }, { status: 400 })
  }
}
