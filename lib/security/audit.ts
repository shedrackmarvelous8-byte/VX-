import { redactSecrets } from './redact'

export type SecurityEventType =
  | 'AUTH_FAILED'
  | 'AUTH_RATE_LIMIT'
  | 'IDOR_ATTEMPT'
  | 'SANDBOX_VIOLATION'
  | 'SSRF_BLOCKED'
  | 'INVALID_FILE_UPLOAD'
  | 'UNAUTHORIZED_ACCESS'
  | 'SUSPICIOUS_INPUT'
  | 'DEPLOY_SECURITY_CHECK'

export interface SecurityEvent {
  type: SecurityEventType
  timestamp: string
  ip: string
  userId?: string
  projectId?: string
  details?: Record<string, unknown>
}

// In-memory security audit event buffer (retains last 200 events)
const securityAuditBuffer: SecurityEvent[] = []
const MAX_AUDIT_EVENTS = 200

/**
 * Records a security audit event. Redacts any potential secrets in details.
 */
export function logSecurityEvent(
  type: SecurityEventType,
  metadata: {
    ip?: string
    userId?: string
    projectId?: string
    details?: Record<string, unknown>
  } = {}
) {
  const sanitizedDetails: Record<string, unknown> = {}

  if (metadata.details) {
    for (const [key, value] of Object.entries(metadata.details)) {
      if (typeof value === 'string') {
        sanitizedDetails[key] = redactSecrets(value)
      } else {
        sanitizedDetails[key] = value
      }
    }
  }

  const event: SecurityEvent = {
    type,
    timestamp: new Date().toISOString(),
    ip: metadata.ip || 'unknown',
    userId: metadata.userId,
    projectId: metadata.projectId,
    details: sanitizedDetails,
  }

  securityAuditBuffer.push(event)
  if (securityAuditBuffer.length > MAX_AUDIT_EVENTS) {
    securityAuditBuffer.shift()
  }

  console.warn(
    `[SECURITY_AUDIT] ${event.timestamp} | ${event.type} | IP: ${event.ip} | User: ${event.userId || 'anon'} | Proj: ${event.projectId || 'none'}`
  )
}

/**
 * Returns recent security events for diagnostics / health endpoints
 */
export function getRecentSecurityEvents(): SecurityEvent[] {
  return [...securityAuditBuffer]
}
