export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { processPaymentWebhook } from '@/lib/billing/provider'

export async function POST(req: NextRequest) {
  const signature = req.headers.get('stripe-signature') || ''
  const rawBody = await req.text().catch(() => '')

  try {
    const result = await processPaymentWebhook({
      rawBody,
      signature,
    })

    return NextResponse.json({ received: true, ...result })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: errorMsg }, { status: 400 })
  }
}
