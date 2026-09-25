import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { db } from '../db/store'
import { decryptSecret, encryptSecret } from '../env-vars/crypto'
import { getProjectEnvVars } from '../env-vars/service'
import { getProjectFilesForGit } from '../github/service'
import type {
  DeployOptions,
  ProjectVercelConfig,
  VercelDeployment,
  VercelDeploymentLog,
  VercelDeploymentState,
  VercelUser,
} from './types'

const DATA_DIR = path.join(process.cwd(), '.data')
const TOKENS_FILE = path.join(DATA_DIR, 'vercel_tokens.json')
const CONFIGS_FILE = path.join(DATA_DIR, 'vercel_configs.json')
const DEPLOYMENTS_FILE = path.join(DATA_DIR, 'vercel_deployments.json')

interface UserVercelRecord {
  encryptedToken: string
  user: VercelUser
  connectedAt: string
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    } catch {
      // ignore
    }
  }
}

function loadTokens(): Record<string, UserVercelRecord> {
  ensureDataDir()
  try {
    if (fs.existsSync(TOKENS_FILE)) {
      return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'))
    }
  } catch {
    // fallback
  }
  return {}
}

function saveTokens(records: Record<string, UserVercelRecord>) {
  ensureDataDir()
  try {
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(records, null, 2), 'utf8')
  } catch (err) {
    console.error('Failed to save Vercel tokens:', err)
  }
}

function loadConfigs(): Record<string, ProjectVercelConfig> {
  ensureDataDir()
  try {
    if (fs.existsSync(CONFIGS_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIGS_FILE, 'utf8'))
    }
  } catch {
    // fallback
  }
  return {}
}

function saveConfigs(records: Record<string, ProjectVercelConfig>) {
  ensureDataDir()
  try {
    fs.writeFileSync(CONFIGS_FILE, JSON.stringify(records, null, 2), 'utf8')
  } catch (err) {
    console.error('Failed to save Vercel project configs:', err)
  }
}

function loadDeployments(): Record<string, VercelDeployment[]> {
  ensureDataDir()
  try {
    if (fs.existsSync(DEPLOYMENTS_FILE)) {
      return JSON.parse(fs.readFileSync(DEPLOYMENTS_FILE, 'utf8'))
    }
  } catch {
    // fallback
  }
  return {}
}

function saveDeployments(records: Record<string, VercelDeployment[]>) {
  ensureDataDir()
  try {
    fs.writeFileSync(DEPLOYMENTS_FILE, JSON.stringify(records, null, 2), 'utf8')
  } catch (err) {
    console.error('Failed to save Vercel deployments:', err)
  }
}

export function getVercelToken(userId: string): string | null {
  const tokens = loadTokens()
  const record = tokens[userId]
  if (record && record.encryptedToken) {
    try {
      return decryptSecret(record.encryptedToken)
    } catch {
      // ignore
    }
  }
  return process.env.VERCEL_TOKEN || null
}

export function getVercelTeamId(): string | null {
  return process.env.VERCEL_TEAM_ID || null
}

function withTeamQuery(url: string): string {
  const teamId = getVercelTeamId()
  if (!teamId) return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}teamId=${encodeURIComponent(teamId)}`
}

export async function getConnectedAccount(userId: string): Promise<VercelUser | null> {
  const tokens = loadTokens()
  const record = tokens[userId]
  if (record) return record.user

  const envToken = process.env.VERCEL_TOKEN
  if (envToken) {
    return {
      id: 'platform_vercel',
      username: 'VX Workspace Host',
      name: 'Vercel Deployment Host',
      email: null,
      avatar: null,
    }
  }

  return null
}

export async function connectWithToken(userId: string, token: string): Promise<VercelUser> {
  const cleanToken = token.trim()
  if (!cleanToken) {
    throw new Error('Vercel token is required')
  }

  const res = await fetch(withTeamQuery('https://api.vercel.com/v2/user'), {
    headers: {
      Authorization: `Bearer ${cleanToken}`,
      'User-Agent': 'VX-Studio-Workspace',
    },
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Vercel verification failed (${res.status}): ${errorText || 'Invalid token'}`)
  }

  const data = await res.json()
  const userData: VercelUser = {
    id: data.user?.id || 'vercel_user',
    username: data.user?.username || 'vercel_user',
    name: data.user?.name || null,
    email: data.user?.email || null,
    avatar: data.user?.avatar || null,
  }

  const tokens = loadTokens()
  tokens[userId] = {
    encryptedToken: encryptSecret(cleanToken),
    user: userData,
    connectedAt: new Date().toISOString(),
  }
  saveTokens(tokens)

  return userData
}

export async function disconnectAccount(userId: string): Promise<void> {
  const tokens = loadTokens()
  delete tokens[userId]
  saveTokens(tokens)
}

export function getOAuthUrl(state?: string): { url: string | null; configured: boolean } {
  const clientId = process.env.VERCEL_CLIENT_ID
  if (!clientId) {
    return { url: null, configured: false }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000'
  const redirectUri = process.env.VERCEL_REDIRECT_URI || `${appUrl}/api/vercel/oauth/callback`
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state: state || 'vx_vercel_oauth',
  })

  return {
    url: `https://vercel.com/oauth/authorize?${params.toString()}`,
    configured: true,
  }
}

export async function detectFramework(projectId: string): Promise<string> {
  const files = await db.listProjectFiles(projectId)
  const pkgFile = files.find((f) => f.path === 'package.json' || f.path === '/package.json')

  if (!pkgFile || !pkgFile.content) {
    return 'other'
  }

  try {
    const pkg = JSON.parse(pkgFile.content)
    const allDeps = {
      ...(pkg.dependencies || {}),
      ...(pkg.devDependencies || {}),
    }

    if (allDeps['next']) return 'nextjs'
    if (allDeps['vite']) return 'vite'
    if (allDeps['@remix-run/react'] || allDeps['remix']) return 'remix'
    if (allDeps['astro']) return 'astro'
    if (allDeps['@sveltejs/kit']) return 'sveltekit'
    if (allDeps['nuxt']) return 'nuxtjs'
    if (allDeps['react-scripts']) return 'create-react-app'
    if (allDeps['vue']) return 'vue'
    if (allDeps['react']) return 'react'
  } catch {
    // fallback
  }

  return 'other'
}

export function getProjectVercelConfig(projectId: string): ProjectVercelConfig {
  const configs = loadConfigs()
  if (configs[projectId]) return configs[projectId]

  const sanitizedName = `vx-project-${projectId.substring(0, 8)}`.toLowerCase()
  return {
    projectId,
    vercelProjectName: sanitizedName,
    framework: 'nextjs',
    syncEnvVars: true,
    updatedAt: new Date().toISOString(),
  }
}

export function saveProjectVercelConfig(projectId: string, update: Partial<ProjectVercelConfig>): ProjectVercelConfig {
  const configs = loadConfigs()
  const current = getProjectVercelConfig(projectId)
  const updated: ProjectVercelConfig = {
    ...current,
    ...update,
    projectId,
    updatedAt: new Date().toISOString(),
  }
  configs[projectId] = updated
  saveConfigs(configs)
  return updated
}

/**
 * Ensures a single Vercel project is created or reused for this VX project (deduplication)
 */
export async function ensureVercelProject(
  userId: string,
  projectId: string,
  desiredName: string,
  framework: string
): Promise<{ id: string; name: string }> {
  const token = getVercelToken(userId)
  if (!token) throw new Error('Vercel token not configured')

  const config = getProjectVercelConfig(projectId)

  // 1. If we already have a vercelProjectId stored, verify it exists
  if (config.vercelProjectId) {
    try {
      const checkRes = await fetch(withTeamQuery(`https://api.vercel.com/v9/projects/${config.vercelProjectId}`), {
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'VX-Studio-Workspace',
        },
      })
      if (checkRes.ok) {
        const pData = await checkRes.json()
        return { id: pData.id, name: pData.name }
      }
    } catch {
      // ignore
    }
  }

  // 2. Check if project with desiredName already exists on user's Vercel account
  const checkNameRes = await fetch(withTeamQuery(`https://api.vercel.com/v9/projects/${desiredName}`), {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'VX-Studio-Workspace',
    },
  })

  if (checkNameRes.ok) {
    const existing = await checkNameRes.json()
    saveProjectVercelConfig(projectId, {
      vercelProjectId: existing.id,
      vercelProjectName: existing.name,
    })
    return { id: existing.id, name: existing.name }
  }

  // 3. Otherwise create the project on Vercel
  const createRes = await fetch(withTeamQuery('https://api.vercel.com/v9/projects'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'VX-Studio-Workspace',
    },
    body: JSON.stringify({
      name: desiredName,
      framework: framework !== 'other' ? framework : undefined,
    }),
  })

  if (createRes.ok) {
    const created = await createRes.json()
    saveProjectVercelConfig(projectId, {
      vercelProjectId: created.id,
      vercelProjectName: created.name,
    })
    return { id: created.id, name: created.name }
  }

  return { id: desiredName, name: desiredName }
}

/**
 * Transfers project environment variables to Vercel project
 */
const FORBIDDEN_DEPLOY_KEYS = new Set([
  'AUTH_SECRET',
  'VERIFICATION_HASH_SECRET',
  'SUPABASE_SERVICE_ROLE_KEY',
  'VERCEL_TOKEN',
  'GITHUB_CLIENT_SECRET',
  'BREVO_API_KEY',
])

export async function syncEnvironmentVariables(
  userId: string,
  projectId: string,
  vercelProjectIdentifier: string
): Promise<{ count: number }> {
  const token = getVercelToken(userId)
  if (!token) return { count: 0 }

  const vars = getProjectEnvVars(projectId)
  if (!vars || vars.length === 0) return { count: 0 }

  let synced = 0
  for (const v of vars) {
    // Security check: Never sync internal platform secrets to user external deployments
    if (FORBIDDEN_DEPLOY_KEYS.has(v.key)) continue

    const targetScopes = v.scope === 'all' ? ['production', 'preview', 'development'] : [v.scope]

    let plainValue = v.value
    if (v.isSecret) {
      try {
        plainValue = decryptSecret(v.value)
      } catch {
        // keep
      }
    }

    try {
      const res = await fetch(
        withTeamQuery(`https://api.vercel.com/v10/projects/${vercelProjectIdentifier}/env?upsert=true`),
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'VX-Studio-Workspace',
          },
          body: JSON.stringify({
            key: v.key,
            value: plainValue,
            type: v.isSecret ? 'secret' : 'plain',
            target: targetScopes,
          }),
        }
      )
      if (res.ok) {
        synced++
      }
    } catch (err) {
      console.warn(`Could not sync env var ${v.key} to Vercel:`, err)
    }
  }

  return { count: synced }
}

/**
 * Initiates real deployment on Vercel
 */
export async function deployToVercel(
  userId: string,
  projectId: string,
  options: DeployOptions = {}
): Promise<VercelDeployment> {
  const token = getVercelToken(userId)
  if (!token) {
    throw new Error('Vercel account is not connected. Please provide a Vercel Access Token.')
  }

  const projectRecord = await db.findProjectById(projectId)
  const projectName = projectRecord?.name || 'vx-project'
  const cleanProjectName = projectName
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .substring(0, 50) || `vx-${projectId.substring(0, 8)}`

  const framework = await detectFramework(projectId)
  const config = getProjectVercelConfig(projectId)
  const desiredProjectName = config.vercelProjectName || cleanProjectName

  // 1. Ensure or reuse Vercel project (prevents duplicates)
  const vercelProject = await ensureVercelProject(userId, projectId, desiredProjectName, framework)

  // 2. Sync env variables if requested
  if (options.syncEnvVars !== false && config.syncEnvVars) {
    await syncEnvironmentVariables(userId, projectId, vercelProject.id).catch(() => null)
  }

  // 3. Prepare sanitized project files
  const files = await getProjectFilesForGit(projectId, userId)
  if (files.length === 0) {
    throw new Error('No files found to deploy in this project')
  }

  // 4. Upload files to Vercel File Storage
  const vercelFiles: Array<{ file: string; sha: string; size: number }> = []

  for (const f of files) {
    const buffer = Buffer.from(f.content, 'utf8')
    const sha = crypto.createHash('sha1').update(buffer).digest('hex')
    const size = buffer.length

    try {
      const uploadRes = await fetch(withTeamQuery('https://api.vercel.com/v2/files'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Length': size.toString(),
          'x-vercel-digest': sha,
          'User-Agent': 'VX-Studio-Workspace',
        },
        body: buffer,
      })

      if (!uploadRes.ok && uploadRes.status !== 409) {
        console.warn(`File upload issue for ${f.path}:`, uploadRes.status)
      }
    } catch (err) {
      console.warn(`Could not upload ${f.path}:`, err)
    }

    vercelFiles.push({
      file: f.path,
      sha,
      size,
    })
  }

  // 5. Create Deployment on Vercel
  const deployBody: Record<string, unknown> = {
    name: vercelProject.name,
    project: vercelProject.id,
    files: vercelFiles,
    target: options.target || 'production',
    projectSettings: {
      framework: framework !== 'other' ? framework : undefined,
    },
  }

  const deployRes = await fetch(withTeamQuery('https://api.vercel.com/v13/deployments'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'VX-Studio-Workspace',
    },
    body: JSON.stringify(deployBody),
  })

  if (!deployRes.ok) {
    const errorText = await deployRes.text()
    let errorMsg = `Deployment creation failed (${deployRes.status}): ${errorText}`
    try {
      const errObj = JSON.parse(errorText)
      if (errObj.error?.message) {
        errorMsg = errObj.error.message
      }
    } catch {
      // keep
    }
    throw new Error(errorMsg)
  }

  const deployData = await deployRes.json()
  const liveUrl = deployData.url ? (deployData.url.startsWith('http') ? deployData.url : `https://${deployData.url}`) : ''

  const deployment: VercelDeployment = {
    id: deployData.id,
    name: deployData.name || vercelProject.name,
    url: liveUrl,
    inspectorUrl: deployData.inspectorUrl,
    readyState: (deployData.readyState || 'INITIALIZING').toUpperCase() as VercelDeploymentState,
    createdAt: deployData.createdAt || Date.now(),
    target: (deployData.target || options.target || 'production') as 'production' | 'preview',
    branch: 'main',
    commitMessage: options.commitMessage || 'Deployment from VX',
  }

  saveProjectVercelConfig(projectId, {
    vercelProjectId: vercelProject.id,
    vercelProjectName: vercelProject.name,
    framework,
    lastDeploymentId: deployment.id,
    lastDeploymentUrl: deployment.url,
    lastDeploymentStatus: deployment.readyState,
  })

  const deployments = loadDeployments()
  if (!deployments[projectId]) {
    deployments[projectId] = []
  }
  deployments[projectId].unshift(deployment)
  deployments[projectId] = deployments[projectId].slice(0, 20)
  saveDeployments(deployments)

  return deployment
}

export async function getDeploymentStatus(userId: string, deploymentId: string): Promise<VercelDeployment> {
  const token = getVercelToken(userId)
  if (!token) throw new Error('Vercel token not configured')

  const res = await fetch(withTeamQuery(`https://api.vercel.com/v13/deployments/${deploymentId}`), {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'VX-Studio-Workspace',
    },
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Failed to fetch deployment status (${res.status}): ${errorText}`)
  }

  const data = await res.json()
  const liveUrl = data.url ? (data.url.startsWith('http') ? data.url : `https://${data.url}`) : ''
  const state = (data.readyState || data.status || 'INITIALIZING').toUpperCase() as VercelDeploymentState

  return {
    id: data.id,
    name: data.name,
    url: liveUrl,
    inspectorUrl: data.inspectorUrl,
    readyState: state,
    createdAt: data.createdAt,
    readyAt: data.ready,
    target: data.target || 'production',
    errorCode: data.errorCode,
    errorMessage: data.errorMessage,
  }
}

export async function getDeploymentLogs(userId: string, deploymentId: string): Promise<VercelDeploymentLog[]> {
  const token = getVercelToken(userId)
  if (!token) return []

  try {
    const res = await fetch(
      withTeamQuery(`https://api.vercel.com/v2/deployments/${deploymentId}/events?direction=backward&limit=100`),
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'VX-Studio-Workspace',
        },
      }
    )

    if (!res.ok) return []

    const data = await res.json()
    if (!Array.isArray(data)) return []

    return data.map((item: any, idx: number) => ({
      id: item.id || `log_${idx}_${item.created || Date.now()}`,
      timestamp: item.created || Date.now(),
      text: item.text || item.payload?.text || item.payload?.info || '',
      type: item.type === 'stderr' ? 'stderr' : item.type === 'stdout' ? 'stdout' : 'system',
    }))
  } catch {
    return []
  }
}

export function getProjectDeployments(projectId: string): VercelDeployment[] {
  const deployments = loadDeployments()
  return deployments[projectId] || []
}
