import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/server'
import { getOAuthUrl } from '@/lib/vercel/service'

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth.errorResponse) return auth.errorResponse

  const { searchParams } = new URL(req.url)
  const state = searchParams.get('state') || `vx_vercel_${auth.user.id}`
  const info = getOAuthUrl(state)

  return NextResponse.json(info)
}
