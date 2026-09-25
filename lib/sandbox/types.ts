export interface SandboxCommandRequest {
  projectId: string
  userId: string
  command: string
  timeoutMs?: number
  env?: Record<string, string>
}

export type SandboxCommandStatus = 'success' | 'failed' | 'timeout' | 'terminated' | 'rejected'

export interface SandboxCommandResult {
  command: string
  exitCode: number | null
  stdout: string
  stderr: string
  duration: number
  status: SandboxCommandStatus
  error?: string
  truncated?: boolean
}

export interface PackageInstallRequest {
  projectId: string
  userId: string
  packageName: string
  dev?: boolean
  version?: string
}

export interface PackageInstallResult {
  success: boolean
  packageName: string
  version?: string
  dev?: boolean
  output: string
  error?: string
}

export type DevServerStatus = 'stopped' | 'starting' | 'running' | 'crashed' | 'error'

export interface DevServerState {
  projectId: string
  status: DevServerStatus
  pid?: number
  port?: number
  url?: string
  logs: string[]
  startedAt?: string
  error?: string
}

export interface BuildErrorInfo {
  file?: string
  line?: number
  column?: number
  message: string
  codeFrame?: string
  type?: 'syntax' | 'type' | 'module' | 'general'
}

export interface BuildResult {
  projectId: string
  success: boolean
  exitCode: number | null
  duration: number
  stdout: string
  stderr: string
  errors: BuildErrorInfo[]
  warnings: string[]
  distFiles?: string[]
}
