export interface BillingStatus {
  isConfigured: boolean
  provider: 'stripe' | null
  message: string
}

export interface CustomerRecord {
  id: string
  userId: string
  email: string
  providerCustomerId: string
  createdAt: string
  updatedAt: string
}

export interface SubscriptionRecord {
  id: string
  userId: string
  status: 'active' | 'past_due' | 'canceled' | 'trialing' | 'unconfigured'
  planId: string
  providerSubscriptionId?: string
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
  createdAt: string
  updatedAt: string
}

export interface InvoiceRecord {
  id: string
  userId: string
  amount: number
  currency: string
  status: 'paid' | 'open' | 'void' | 'uncollectible'
  providerInvoiceId?: string
  hostedInvoiceUrl?: string
  createdAt: string
}

export interface WebhookEventRecord {
  id: string
  provider: string
  eventId: string
  eventType: string
  processed: boolean
  processedAt: string
  signatureVerified: boolean
}
