export type UsageEventType =
  | 'ai_request'
  | 'ai_tokens'
  | 'build_execution'
  | 'sandbox_command'
  | 'dev_server_session'
  | 'database_query'
  | 'storage_bytes'

export interface UsageRecord {
  id: string
  projectId: string
  userId: string
  type: UsageEventType
  quantity: number
  durationMs?: number
  metadata?: Record<string, unknown>
  createdAt: string
}

export interface ProjectUsageSummary {
  projectId: string
  period: 'day' | 'month' | 'all'
  totals: {
    aiRequests: number
    aiTokens: number
    builds: number
    commands: number
    databaseQueries: number
    sandboxMinutes: number
  }
  limits: {
    maxAiTokensDaily: number
    maxBuildsDaily: number
    maxDatabaseQueriesDaily: number
  }
}
