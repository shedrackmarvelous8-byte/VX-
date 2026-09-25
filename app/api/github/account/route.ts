import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/server'
import {
  connectWithToken,
  disconnectAccount,
  getConnectedAccount,
} from '@/lib/github/service'

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth.errorResponse) return auth.errorResponse

  try {
    const account = await getConnectedAccount(auth.user.id)
    return NextResponse.json({
      connected: Boolean(account),
      account: account
        ? {
            login: account.login,
            name: account.name,
            email: account.email,
            avatarUrl: account.avatar_url,
            htmlUrl: account.html_url,
            publicRepos: account.public_repos,
            totalPrivateRepos: account.total_private_repos,
          }
        : null,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch GitHub account' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth.errorResponse) return auth.errorResponse

  try {
    const body = await req.json()
    const { token } = body
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'GitHub access token is required' }, { status: 400 })
    }

    const user = await connectWithToken(auth.user.id, token)
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
    return NextResponse.json({ error: err.message || 'Failed to connect GitHub account' }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth.errorResponse) return auth.errorResponse

  try {
    await disconnectAccount(auth.user.id)
    return NextResponse.json({ success: true, connected: false })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to disconnect GitHub' }, { status: 500 })
  }
}
