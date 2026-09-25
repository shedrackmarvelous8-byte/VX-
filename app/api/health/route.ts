export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { isSupabaseConfigured } from '@/lib/db/supabase'
import { validateProductionConfig } from '@/lib/security/config-validator'
import { getRecentSecurityEvents } from '@/lib/security/audit'

export async function GET() {
  const configStatus = validateProductionConfig()
  const recentEvents = getRecentSecurityEvents().slice(-5)

  return NextResponse.json({
    status: configStatus.valid ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    service: 'VX Backend Engine',
    version: '13.0.0',
    phase: 'Phase 13: PWA + Production Security',
    database: {
      supabase_configured: isSupabaseConfigured(),
      mode: isSupabaseConfigured() ? 'supabase-postgresql' : 'persistent-store',
    },
    pwa: {
      manifest: true,
      serviceWorker: true,
      offlineReady: true,
    },
    security: {
      rateLimiting: 'active',
      secretRedaction: 'active',
      hsts: 'active',
      csp: 'active',
      corsProtection: 'active',
      ssrfProtection: 'active',
      configValidation: configStatus.valid ? 'passed' : 'warnings',
      warnings: configStatus.warnings,
      recentAuditEventsCount: recentEvents.length,
    },
  })
}
