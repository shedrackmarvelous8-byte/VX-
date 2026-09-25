import type { ProjectUsageSummary, UsageEventType, UsageRecord } from './types'

const usageStore: UsageRecord[] = []

export async function recordUsageEvent(params: {
  projectId: string
  userId: string
  type: UsageEventType
  quantity?: number
  durationMs?: number
  metadata?: Record<string, unknown>
}): Promise<UsageRecord> {
  const { projectId, userId, type, quantity = 1, durationMs, metadata } = params

  const record: UsageRecord = {
    id: `use_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    projectId,
    userId,
    type,
    quantity,
    durationMs,
    metadata,
    createdAt: new Date().toISOString(),
  }

  usageStore.push(record)

  // Bound memory store
  if (usageStore.length > 2000) {
    usageStore.shift()
  }

  return record
}

export async function getProjectUsage(
  projectId: string,
  period: 'day' | 'month' | 'all' = 'month'
): Promise<ProjectUsageSummary> {
  const now = Date.now()
  const cutoff =
    period === 'day'
      ? now - 86400000
      : period === 'month'
      ? now - 30 * 86400000
      : 0

  const records = usageStore.filter(
    (r) => r.projectId === projectId && new Date(r.createdAt).getTime() >= cutoff
  )

  let aiRequests = 0
  let aiTokens = 0
  let builds = 0
  let commands = 0
  let databaseQueries = 0
  let totalDurationMs = 0

  for (const r of records) {
    if (r.type === 'ai_request') aiRequests += r.quantity
    else if (r.type === 'ai_tokens') aiTokens += r.quantity
    else if (r.type === 'build_execution') builds += r.quantity
    else if (r.type === 'sandbox_command') commands += r.quantity
    else if (r.type === 'database_query') databaseQueries += r.quantity
    
    if (r.durationMs) totalDurationMs += r.durationMs
  }

  return {
    projectId,
    period,
    totals: {
      aiRequests,
      aiTokens,
      builds,
      commands,
      databaseQueries,
      sandboxMinutes: Math.round(totalDurationMs / 60000),
    },
    limits: {
      maxAiTokensDaily: 500000,
      maxBuildsDaily: 100,
      maxDatabaseQueriesDaily: 10000,
    },
  }
}
