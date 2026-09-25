export interface VercelUser {
  id: string
  username: string
  name: string | null
  email: string | null
  avatar: string | null
}

export interface VercelProject {
  id: string
  name: string
  framework: string | null
  link?: {
    type: string
    repo: string
  }
}

export type VercelDeploymentState =
  | 'INITIALIZING'
  | 'QUEUED'
  | 'BUILDING'
  | 'READY'
  | 'ERROR'
  | 'CANCELED'

export interface VercelDeployment {
  id: string
  name: string
  url: string
  inspectorUrl?: string
  readyState: VercelDeploymentState
  createdAt: number
  readyAt?: number
  target: 'production' | 'preview'
  branch?: string
  commitSha?: string
  commitMessage?: string
  errorCode?: string
  errorMessage?: string
}

export interface VercelDeploymentLog {
  id: string
  timestamp: number
  text: string
  type: 'stdout' | 'stderr' | 'system'
}

export interface ProjectVercelConfig {
  projectId: string
  vercelProjectId?: string
  vercelProjectName: string
  framework: string
  syncEnvVars: boolean
  lastDeploymentId?: string
  lastDeploymentUrl?: string
  lastDeploymentStatus?: VercelDeploymentState
  updatedAt: string
}

export interface DeployOptions {
  target?: 'production' | 'preview'
  syncEnvVars?: boolean
  commitMessage?: string
}
