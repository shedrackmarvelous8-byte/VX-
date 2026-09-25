import crypto from 'crypto'
import type { BillingStatus, SubscriptionRecord, WebhookEventRecord } from './types'

// Store processed webhook event IDs to guarantee idempotency and replay protection
const processedWebhookEvents = new Map<string, WebhookEventRecord>()

export function getBillingStatus(): BillingStatus {
  const isConfigured = Boolean(
    process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET
  )

  return {
    isConfigured,
    provider: isConfigured ? 'stripe' : null,
    message: isConfigured
      ? 'Payment provider active and configured.'
      : 'Payment provider is not yet configured. Billing and paid subscriptions are currently unavailable.',
  }
}

export function verifyWebhookSignature(params: {
  payload: string
  signatureHeader: string
  secret: string
  toleranceSeconds?: number
}): { valid: boolean; error?: string } {
  const { payload, signatureHeader, secret, toleranceSeconds = 300 } = params

  if (!signatureHeader || !secret) {
    return { valid: false, error: 'Missing signature header or webhook secret.' }
  }

  // Parse Stripe signature format: t=1234567,v1=abc...
  const parts = signatureHeader.split(',')
  let timestamp = ''
  const signatures: string[] = []

  for (const part of parts) {
    const [key, val] = part.split('=')
    if (key === 't') timestamp = val
    if (key === 'v1') signatures.push(val)
  }

  if (!timestamp || signatures.length === 0) {
    return { valid: false, error: 'Malformed webhook signature header format.' }
  }

  // Check timestamp tolerance to prevent replay attacks
  const eventTime = parseInt(timestamp, 10)
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - eventTime) > toleranceSeconds) {
    return { valid: false, error: 'Webhook timestamp exceeds tolerance limit (replay attack protection).' }
  }

  // Compute expected HMAC
  const signedPayload = `${timestamp}.${payload}`
  const expectedHmac = crypto
    .createHmac('sha256', secret)
    .update(signedPayload, 'utf8')
    .digest('hex')

  const isValid = signatures.some((sig) => {
    try {
      return crypto.timingSafeEqual(
        Buffer.from(sig, 'hex'),
        Buffer.from(expectedHmac, 'hex')
      )
    } catch {
      return false
    }
  })

  return { valid: isValid, error: isValid ? undefined : 'Webhook signature mismatch.' }
}

export async function processPaymentWebhook(params: {
  rawBody: string
  signature: string
}): Promise<{ processed: boolean; reason?: string }> {
  const status = getBillingStatus()
  if (!status.isConfigured) {
    return { processed: false, reason: 'Payment system is not configured.' }
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!
  const verification = verifyWebhookSignature({
    payload: params.rawBody,
    signatureHeader: params.signature,
    secret: webhookSecret,
  })

  if (!verification.valid) {
    throw new Error(`Unauthorized webhook: ${verification.error}`)
  }

  let eventObj: { id: string; type: string }
  try {
    eventObj = JSON.parse(params.rawBody)
  } catch {
    throw new Error('Invalid JSON webhook body')
  }

  // Idempotency check
  if (processedWebhookEvents.has(eventObj.id)) {
    return { processed: true, reason: 'Event already processed (idempotent duplicate).' }
  }

  const record: WebhookEventRecord = {
    id: `ev_${Date.now()}`,
    provider: 'stripe',
    eventId: eventObj.id,
    eventType: eventObj.type,
    processed: true,
    processedAt: new Date().toISOString(),
    signatureVerified: true,
  }

  processedWebhookEvents.set(eventObj.id, record)

  // Bound memory store
  if (processedWebhookEvents.size > 1000) {
    const firstKey = processedWebhookEvents.keys().next().value
    if (firstKey) processedWebhookEvents.delete(firstKey)
  }

  return { processed: true }
}

export async function getUserSubscription(userId: string): Promise<SubscriptionRecord> {
  // If no provider configured, return clean unconfigured state
  return {
    id: `sub_${userId}`,
    userId,
    status: 'unconfigured',
    planId: 'developer_tier',
    currentPeriodStart: new Date().toISOString(),
    currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
    cancelAtPeriodEnd: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}
