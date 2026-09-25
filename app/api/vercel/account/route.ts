import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/server'
import {
  connectWithToken,
  disconnectAccount,
  getConnectedAccount,
} from '@/lib/vercel/service'

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth.errorResponse) return auth.errorResponse

  try {
    const account = await getConnectedAccount(auth.user.id)
    return NextResponse.json({
      connected: Boolean(account),
      account: account
        ? {
            username: account.username,
            name: account.name,
            email: account.email,
            avatar: account.avatar,
          }
        : null,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch Vercel account' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth.errorResponse) return auth.errorResponse

  try {
    const { token } = await req.json()
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Vercel access token is required' }, { status: 400 })
    }

    const user = await connectWithToken(auth.user.id, token)
    return NextResponse.json({
      success: true,
      account: {
        username: user.username,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to connect Vercel account' }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth.errorResponse) return auth.errorResponse

  try {
    await disconnectAccount(auth.user.id)
    return NextResponse.json({ success: true, connected: false })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to disconnect Vercel' }, { status: 500 })
  }
}
