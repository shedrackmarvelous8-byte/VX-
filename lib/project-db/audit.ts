import type { DatabaseOperationAudit } from './types'

const auditLogStore: DatabaseOperationAudit[] = []

export async function logDatabaseAudit(
  entry: Omit<DatabaseOperationAudit, 'id' | 'createdAt'>
): Promise<DatabaseOperationAudit> {
  const record: DatabaseOperationAudit = {
    id: `db_audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    ...entry,
  }

  auditLogStore.push(record)

  // Keep memory store bounded (last 500 records)
  if (auditLogStore.length > 500) {
    auditLogStore.shift()
  }

  return record
}

export async function getProjectDatabaseAuditLogs(
  projectId: string,
  limit = 50
): Promise<DatabaseOperationAudit[]> {
  return auditLogStore
    .filter((entry) => entry.projectId === projectId)
    .slice(-limit)
    .reverse()
}
