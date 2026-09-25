import fs from 'fs'
import path from 'path'
import type {
  EnvVarAuditLog,
  EnvVarScope,
  MaskedEnvVar,
  ProjectEnvVar,
} from './types'
import { decryptSecret, encryptSecret, maskSecretValue } from './crypto'
import { sanitizeSandboxEnv } from '../sandbox/security'

const BASE_SANDBOX_DIR = path.resolve(process.cwd(), '.sandboxes')
const auditLogs: EnvVarAuditLog[] = []

function getEnvDir(projectId: string): string {
  const sanitized = projectId.replace(/[^a-zA-Z0-9_-]/g, '')
  return path.join(BASE_SANDBOX_DIR, sanitized, 'env')
}

function getEnvFilePath(projectId: string): string {
  return path.join(getEnvDir(projectId), 'vars.json')
}

function loadProjectEnv(projectId: string): ProjectEnvVar[] {
  const filePath = getEnvFilePath(projectId)
  if (!fs.existsSync(filePath)) {
    // Default starter environment variables
    const initial: ProjectEnvVar[] = [
      {
        id: 'env_node_env',
        projectId,
        key: 'NODE_ENV',
        value: 'development',
        isSecret: false,
        scope: 'all',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'env_app_url',
        projectId,
        key: 'NEXT_PUBLIC_APP_URL',
        value: 'http://localhost:3000',
        isSecret: false,
        scope: 'all',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]

    const dir = getEnvDir(projectId)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(filePath, JSON.stringify(initial, null, 2), 'utf-8')
    return initial
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw) as ProjectEnvVar[]
  } catch {
    return []
  }
}

function saveProjectEnv(projectId: string, vars: ProjectEnvVar[]): void {
  const dir = getEnvDir(projectId)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  const filePath = getEnvFilePath(projectId)
  fs.writeFileSync(filePath, JSON.stringify(vars, null, 2), 'utf-8')
}

export async function logEnvAudit(
  entry: Omit<EnvVarAuditLog, 'id' | 'createdAt'>
): Promise<EnvVarAuditLog> {
  const record: EnvVarAuditLog = {
    id: `env_audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    ...entry,
  }
  auditLogs.push(record)
  if (auditLogs.length > 500) auditLogs.shift()
  return record
}

// ----------------- Public Services -----------------

export async function listProjectEnvVars(projectId: string): Promise<MaskedEnvVar[]> {
  const list = loadProjectEnv(projectId)
  return list.map((item) => {
    let masked = item.value
    if (item.isSecret) {
      masked = maskSecretValue(item.value)
    }
    return {
      id: item.id,
      projectId: item.projectId,
      key: item.key,
      isSecret: item.isSecret,
      scope: item.scope,
      maskedValue: masked,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }
  })
}

export async function createProjectEnvVar(params: {
  projectId: string
  userId: string
  key: string
  value: string
  isSecret?: boolean
  scope?: EnvVarScope
}): Promise<MaskedEnvVar> {
  const { projectId, userId, key, value, isSecret = false, scope = 'all' } = params
  const cleanKey = key.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '')
  if (!cleanKey) throw new Error('Invalid environment variable name.')

  const list = loadProjectEnv(projectId)
  if (list.some((v) => v.key === cleanKey)) {
    throw new Error(`Variable "${cleanKey}" already exists.`)
  }

  const storedValue = isSecret ? encryptSecret(value) : value
  const now = new Date().toISOString()
  const newVar: ProjectEnvVar = {
    id: `env_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    projectId,
    key: cleanKey,
    value: storedValue,
    isSecret,
    scope,
    createdAt: now,
    updatedAt: now,
  }

  list.push(newVar)
  saveProjectEnv(projectId, list)

  await logEnvAudit({
    projectId,
    userId,
    action: 'create',
    key: cleanKey,
    scope,
    isSecret,
  })

  return {
    id: newVar.id,
    projectId,
    key: cleanKey,
    isSecret,
    scope,
    maskedValue: isSecret ? maskSecretValue(value) : value,
    createdAt: now,
    updatedAt: now,
  }
}

export async function updateProjectEnvVar(params: {
  projectId: string
  userId: string
  variableId: string
  value?: string
  isSecret?: boolean
  scope?: EnvVarScope
}): Promise<MaskedEnvVar> {
  const { projectId, userId, variableId, value, isSecret, scope } = params
  const list = loadProjectEnv(projectId)
  const index = list.findIndex((v) => v.id === variableId)
  if (index === -1) throw new Error('Environment variable not found.')

  const current = list[index]
  const nextIsSecret = isSecret !== undefined ? isSecret : current.isSecret
  const nextScope = scope !== undefined ? scope : current.scope

  let nextStoredValue = current.value
  if (value !== undefined) {
    nextStoredValue = nextIsSecret ? encryptSecret(value) : value
  } else if (isSecret !== undefined && isSecret !== current.isSecret) {
    // Toggled secret status
    if (nextIsSecret) {
      nextStoredValue = encryptSecret(current.value)
    } else {
      nextStoredValue = decryptSecret(current.value)
    }
  }

  const updated: ProjectEnvVar = {
    ...current,
    value: nextStoredValue,
    isSecret: nextIsSecret,
    scope: nextScope,
    updatedAt: new Date().toISOString(),
  }

  list[index] = updated
  saveProjectEnv(projectId, list)

  await logEnvAudit({
    projectId,
    userId,
    action: 'update',
    key: current.key,
    scope: nextScope,
    isSecret: nextIsSecret,
  })

  return {
    id: updated.id,
    projectId,
    key: updated.key,
    isSecret: updated.isSecret,
    scope: updated.scope,
    maskedValue: updated.isSecret ? '••••••••' : updated.value,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  }
}

export async function deleteProjectEnvVar(params: {
  projectId: string
  userId: string
  variableId: string
}): Promise<{ success: boolean; variableId: string; key: string }> {
  const { projectId, userId, variableId } = params
  const list = loadProjectEnv(projectId)
  const target = list.find((v) => v.id === variableId)
  if (!target) throw new Error('Environment variable not found.')

  const filtered = list.filter((v) => v.id !== variableId)
  saveProjectEnv(projectId, filtered)

  await logEnvAudit({
    projectId,
    userId,
    action: 'delete',
    key: target.key,
    scope: target.scope,
    isSecret: target.isSecret,
  })

  return { success: true, variableId, key: target.key }
}

export async function revealProjectEnvVar(params: {
  projectId: string
  userId: string
  variableId: string
}): Promise<{ key: string; value: string; isSecret: boolean }> {
  const { projectId, userId, variableId } = params
  const list = loadProjectEnv(projectId)
  const target = list.find((v) => v.id === variableId)
  if (!target) throw new Error('Environment variable not found.')

  const decrypted = target.isSecret ? decryptSecret(target.value) : target.value

  await logEnvAudit({
    projectId,
    userId,
    action: 'reveal',
    key: target.key,
    scope: target.scope,
    isSecret: target.isSecret,
  })

  return {
    key: target.key,
    value: decrypted,
    isSecret: target.isSecret,
  }
}

export async function getResolvedEnvForSandbox(
  projectId: string,
  scope: 'development' | 'preview' | 'production' = 'development'
): Promise<Record<string, string>> {
  const list = loadProjectEnv(projectId)
  const resolved: Record<string, string> = {}

  for (const item of list) {
    if (item.scope === 'all' || item.scope === scope) {
      const val = item.isSecret ? decryptSecret(item.value) : item.value
      resolved[item.key] = val
    }
  }

  const sanitized = sanitizeSandboxEnv(resolved)
  const result: Record<string, string> = {}
  for (const [k, v] of Object.entries(sanitized)) {
    if (v !== undefined) {
      result[k] = v
    }
  }
  return result
}

export function getProjectEnvVars(projectId: string): ProjectEnvVar[] {
  return loadProjectEnv(projectId)
}

export async function getProjectSecretValues(projectId: string): Promise<string[]> {
  const list = loadProjectEnv(projectId)
  const secrets: string[] = []
  for (const item of list) {
    if (item.isSecret) {
      const val = decryptSecret(item.value)
      if (val && val.length >= 4) secrets.push(val)
    }
  }
  return secrets
}
