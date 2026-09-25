export type EnvVarScope = 'development' | 'preview' | 'production' | 'all'
export type EnvironmentScope = EnvVarScope

export interface ProjectEnvVar {
  id: string
  projectId: string
  key: string
  value: string // Encrypted if isSecret === true
  isSecret: boolean
  scope: EnvVarScope
  createdAt: string
  updatedAt: string
}

export interface MaskedEnvVar {
  id: string
  projectId: string
  key: string
  isSecret: boolean
  scope: EnvVarScope
  maskedValue: string
  createdAt: string
  updatedAt: string
}

export type EnvironmentVariableMeta = MaskedEnvVar

export interface EnvVarAuditLog {
  id: string
  projectId: string
  userId: string
  action: 'create' | 'update' | 'delete' | 'reveal'
  key: string
  scope: EnvVarScope
  isSecret: boolean
  createdAt: string
}
