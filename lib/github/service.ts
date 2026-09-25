import fs from 'fs'
import path from 'path'
import { db } from '../db/store'
import { decryptSecret, encryptSecret } from '../env-vars/crypto'
import { syncProjectFilesToDisk } from '../sandbox/fs-sync'
import type {
  GitCommitPayload,
  GitCommitResult,
  GitHubBranch,
  GitHubCommitItem,
  GitHubRepo,
  GitHubUser,
  ProjectGitLink,
  ProjectGitStatus,
} from './types'

const DATA_DIR = path.join(process.cwd(), '.data')
const TOKENS_FILE = path.join(DATA_DIR, 'github_tokens.json')
const GIT_LINKS_FILE = path.join(DATA_DIR, 'project_git_links.json')

// Patterns strictly excluded from Git commits to protect secrets
const SENSITIVE_FILENAME_PATTERNS = [
  /^\.env(?:\..+)?$/,
  /\.env\.local$/i,
  /\.env\.production$/i,
  /\.env\.development$/i,
  /\.pem$/i,
  /\.key$/i,
  /^id_rsa/i,
  /^id_ed25519/i,
  /\.pfx$/i,
  /\.p12$/i,
  /vx_database\.json$/i,
  /vars\.json$/i,
]

const SECRET_CONTENT_PATTERNS = [
  /(?:sk_live_|sk_test_|ghp_|gho_|xoxb-|xoxp-|AIzaSy)[a-zA-Z0-9_-]{16,}/g,
  /(?:postgres(?:ql)?:\/\/[^\s:@]+:)([^\s@]+)(?:@[^\s]+)/gi,
  /(?:Bearer\s+)[a-zA-Z0-9_.-]{20,}/gi,
]

interface UserGitHubRecord {
  encryptedToken: string
  user: GitHubUser
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

function loadTokens(): Record<string, UserGitHubRecord> {
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

function saveTokens(records: Record<string, UserGitHubRecord>) {
  ensureDataDir()
  try {
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(records, null, 2), 'utf8')
  } catch (err) {
    console.error('Failed to save GitHub tokens:', err)
  }
}

function loadGitLinks(): Record<string, ProjectGitLink> {
  ensureDataDir()
  try {
    if (fs.existsSync(GIT_LINKS_FILE)) {
      return JSON.parse(fs.readFileSync(GIT_LINKS_FILE, 'utf8'))
    }
  } catch {
    // fallback
  }
  return {}
}

function saveGitLinks(records: Record<string, ProjectGitLink>) {
  ensureDataDir()
  try {
    fs.writeFileSync(GIT_LINKS_FILE, JSON.stringify(records, null, 2), 'utf8')
  } catch (err) {
    console.error('Failed to save project git links:', err)
  }
}

export function getUserToken(userId: string): string | null {
  const tokens = loadTokens()
  const record = tokens[userId]
  if (!record || !record.encryptedToken) return null
  try {
    return decryptSecret(record.encryptedToken)
  } catch {
    return null
  }
}

export async function getConnectedAccount(userId: string): Promise<GitHubUser | null> {
  const tokens = loadTokens()
  const record = tokens[userId]
  if (!record) return null
  return record.user
}

export async function connectWithToken(userId: string, token: string): Promise<GitHubUser> {
  const cleanToken = token.trim()
  if (!cleanToken) {
    throw new Error('Token is required')
  }

  const res = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${cleanToken}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'VX-Studio-Workspace',
    },
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`GitHub verification failed (${res.status}): ${errorText || 'Invalid token'}`)
  }

  const userData: GitHubUser = await res.json()

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
  const clientId = process.env.GITHUB_CLIENT_ID
  if (!clientId) {
    return { url: null, configured: false }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000'
  const redirectUri = process.env.GITHUB_REDIRECT_URI || `${appUrl}/api/github/oauth/callback`
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'repo,read:user,user:email',
    state: state || 'vx_github_oauth',
  })

  return {
    url: `https://github.com/login/oauth/authorize?${params.toString()}`,
    configured: true,
  }
}

export async function exchangeOAuthCode(userId: string, code: string): Promise<GitHubUser> {
  const clientId = process.env.GITHUB_CLIENT_ID
  const clientSecret = process.env.GITHUB_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('GitHub OAuth is not configured on this server (GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET missing)')
  }

  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'VX-Studio-Workspace',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  })

  if (!res.ok) {
    throw new Error('Failed to exchange GitHub authorization code')
  }

  const data = await res.json()
  if (data.error || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Failed to obtain access token from GitHub')
  }

  return await connectWithToken(userId, data.access_token)
}

export async function listUserRepos(userId: string, page = 1, perPage = 30): Promise<GitHubRepo[]> {
  const token = getUserToken(userId)
  if (!token) throw new Error('GitHub account is not connected')

  const res = await fetch(`https://api.github.com/user/repos?sort=updated&per_page=${perPage}&page=${page}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'VX-Studio-Workspace',
    },
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Failed to list GitHub repositories (${res.status}): ${errorText}`)
  }

  return await res.json()
}

export async function createRepo(
  userId: string,
  params: { name: string; description?: string; isPrivate?: boolean }
): Promise<GitHubRepo> {
  const token = getUserToken(userId)
  if (!token) throw new Error('GitHub account is not connected')

  const res = await fetch('https://api.github.com/user/repos', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'VX-Studio-Workspace',
    },
    body: JSON.stringify({
      name: params.name,
      description: params.description || '',
      private: Boolean(params.isPrivate),
      auto_init: true,
    }),
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Failed to create repository on GitHub (${res.status}): ${errorText}`)
  }

  return await res.json()
}

export async function getRepoBranches(userId: string, owner: string, repo: string): Promise<GitHubBranch[]> {
  const token = getUserToken(userId)
  if (!token) throw new Error('GitHub account is not connected')

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'VX-Studio-Workspace',
    },
  })

  if (!res.ok) {
    return [{ name: 'main', commit: { sha: '', url: '' } }]
  }

  return await res.json()
}

export function getProjectLink(projectId: string): ProjectGitLink | null {
  const links = loadGitLinks()
  return links[projectId] || null
}

export function linkProjectRepo(
  projectId: string,
  params: { repoFullName: string; branch?: string; repoUrl?: string; isPrivate?: boolean }
): ProjectGitLink {
  const links = loadGitLinks()
  const link: ProjectGitLink = {
    projectId,
    repoFullName: params.repoFullName,
    branch: params.branch || 'main',
    repoUrl: params.repoUrl || `https://github.com/${params.repoFullName}`,
    isPrivate: Boolean(params.isPrivate),
    linkedAt: new Date().toISOString(),
  }
  links[projectId] = link
  saveGitLinks(links)
  return link
}

export function unlinkProjectRepo(projectId: string): void {
  const links = loadGitLinks()
  delete links[projectId]
  saveGitLinks(links)
}

export function isSensitiveFile(filePath: string): boolean {
  const basename = path.basename(filePath)
  return SENSITIVE_FILENAME_PATTERNS.some((pattern) => pattern.test(basename))
}

export function detectHardcodedSecrets(content: string): string[] {
  const found: string[] = []
  for (const pattern of SECRET_CONTENT_PATTERNS) {
    pattern.lastIndex = 0
    if (pattern.test(content)) {
      found.push(pattern.source)
    }
  }
  return found
}

export async function getProjectFilesForGit(
  projectId: string,
  userId: string
): Promise<Array<{ path: string; content: string }>> {
  await syncProjectFilesToDisk(projectId, userId)
  const dbFiles = await db.listProjectFiles(projectId)

  const sanitizedFiles: Array<{ path: string; content: string }> = []
  let hasEnv = false

  for (const f of dbFiles) {
    if (f.is_folder) continue

    const cleanPath = f.path.startsWith('/') ? f.path.substring(1) : f.path

    if (cleanPath.startsWith('node_modules/') || cleanPath.startsWith('.sandboxes/') || cleanPath.startsWith('.data/')) {
      continue
    }

    if (isSensitiveFile(cleanPath)) {
      hasEnv = true
      continue
    }

    let content = f.content || ''
    for (const pattern of SECRET_CONTENT_PATTERNS) {
      content = content.replace(pattern, '[REDACTED_SECRET]')
    }

    sanitizedFiles.push({
      path: cleanPath,
      content,
    })
  }

  const existingExample = sanitizedFiles.find((f) => f.path === '.env.example')
  if (hasEnv && !existingExample) {
    sanitizedFiles.push({
      path: '.env.example',
      content: `# Safe Environment Example for Project\n# Generated by VX Studio\nNODE_ENV=production\n`,
    })
  }

  return sanitizedFiles
}

export async function getProjectGitStatus(userId: string, projectId: string): Promise<ProjectGitStatus> {
  const account = await getConnectedAccount(userId)
  const link = getProjectLink(projectId)

  if (!account || !link) {
    return {
      connected: Boolean(account),
      hasAccount: Boolean(account),
      user: account
        ? {
            login: account.login,
            avatarUrl: account.avatar_url,
            htmlUrl: account.html_url,
          }
        : undefined,
      link: null,
      branch: 'main',
      modifiedFiles: [],
      addedFiles: [],
      deletedFiles: [],
      totalChanges: 0,
      lastCommit: null,
      lastPushAt: null,
      protectedSecretsDetected: [],
    }
  }

  const token = getUserToken(userId)
  const [owner, repo] = link.repoFullName.split('/')
  const branch = link.branch || 'main'

  let lastCommit: GitHubCommitItem | null = null
  let remoteTreeFiles: Record<string, string> = {}

  if (token && owner && repo) {
    try {
      const refRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${branch}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'VX-Studio-Workspace',
        },
      })

      if (refRes.ok) {
        const refData = await refRes.json()
        const headSha = refData.object?.sha

        if (headSha) {
          const commitRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits/${headSha}`, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github.v3+json',
              'User-Agent': 'VX-Studio-Workspace',
            },
          })

          if (commitRes.ok) {
            const cData = await commitRes.json()
            lastCommit = {
              sha: cData.sha.substring(0, 7),
              message: cData.commit?.message || 'Latest commit',
              authorName: cData.commit?.author?.name || cData.author?.login || 'VX Developer',
              authorAvatar: cData.author?.avatar_url,
              date: cData.commit?.author?.date || new Date().toISOString(),
              htmlUrl: cData.html_url || `https://github.com/${owner}/${repo}/commit/${cData.sha}`,
            }
          }

          const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${headSha}?recursive=1`, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github.v3+json',
              'User-Agent': 'VX-Studio-Workspace',
            },
          })

          if (treeRes.ok) {
            const treeData = await treeRes.json()
            if (Array.isArray(treeData.tree)) {
              for (const item of treeData.tree) {
                if (item.type === 'blob') {
                  remoteTreeFiles[item.path] = item.sha
                }
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn('Could not inspect remote GitHub tree:', err)
    }
  }

  const localFiles = await getProjectFilesForGit(projectId, userId)
  const localMap = new Map<string, string>()
  for (const f of localFiles) {
    localMap.set(f.path, f.content)
  }

  const addedFiles: string[] = []
  const modifiedFiles: string[] = []
  const deletedFiles: string[] = []
  const protectedSecretsDetected: string[] = []

  for (const [pathKey, content] of localMap.entries()) {
    if (!(pathKey in remoteTreeFiles)) {
      addedFiles.push(pathKey)
    }

    const secrets = detectHardcodedSecrets(content)
    if (secrets.length > 0) {
      protectedSecretsDetected.push(pathKey)
    }
  }

  for (const remotePath of Object.keys(remoteTreeFiles)) {
    if (!localMap.has(remotePath) && !remotePath.startsWith('.')) {
      deletedFiles.push(remotePath)
    }
  }

  if (Object.keys(remoteTreeFiles).length === 0) {
    for (const f of localFiles) {
      if (!addedFiles.includes(f.path)) {
        addedFiles.push(f.path)
      }
    }
  }

  const totalChanges = addedFiles.length + modifiedFiles.length + deletedFiles.length

  return {
    connected: true,
    hasAccount: true,
    user: {
      login: account.login,
      avatarUrl: account.avatar_url,
      htmlUrl: account.html_url,
    },
    link,
    branch,
    modifiedFiles,
    addedFiles,
    deletedFiles,
    totalChanges,
    lastCommit: lastCommit || (link.lastCommitSha ? {
      sha: link.lastCommitSha.substring(0, 7),
      message: link.lastCommitMessage || 'Initial commit',
      authorName: account.name || account.login,
      date: link.lastCommitAt || link.linkedAt,
      htmlUrl: `${link.repoUrl}/commit/${link.lastCommitSha}`,
    } : null),
    lastPushAt: link.lastPushAt || null,
    protectedSecretsDetected,
  }
}

export async function commitAndPush(
  userId: string,
  projectId: string,
  payload: GitCommitPayload
): Promise<GitCommitResult> {
  const token = getUserToken(userId)
  if (!token) throw new Error('GitHub account is not connected')

  const link = getProjectLink(projectId)
  if (!link) throw new Error('Project is not linked to a GitHub repository')

  const [owner, repo] = link.repoFullName.split('/')
  const branch = payload.branch || link.branch || 'main'
  const message = payload.message?.trim() || `Update project files from VX (${new Date().toLocaleDateString()})`

  const files = await getProjectFilesForGit(projectId, userId)
  if (files.length === 0) {
    throw new Error('No files found in project to commit')
  }

  let headSha: string | null = null
  let baseTreeSha: string | null = null

  const refRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${branch}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'VX-Studio-Workspace',
    },
  })

  if (refRes.ok) {
    const refData = await refRes.json()
    headSha = refData.object?.sha

    if (headSha) {
      const commitRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits/${headSha}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'VX-Studio-Workspace',
        },
      })
      if (commitRes.ok) {
        const commitData = await commitRes.json()
        baseTreeSha = commitData.tree?.sha
      }
    }
  }

  const treeItems = files.map((file) => ({
    path: file.path,
    mode: '100644',
    type: 'blob',
    content: file.content,
  }))

  const treeRequestBody: Record<string, unknown> = {
    tree: treeItems,
  }
  if (baseTreeSha) {
    treeRequestBody.base_tree = baseTreeSha
  }

  const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'VX-Studio-Workspace',
    },
    body: JSON.stringify(treeRequestBody),
  })

  if (!treeRes.ok) {
    const errText = await treeRes.text()
    throw new Error(`Failed to create Git tree on GitHub (${treeRes.status}): ${errText}`)
  }

  const newTree = await treeRes.json()
  const newTreeSha = newTree.sha

  const commitPayload: Record<string, unknown> = {
    message,
    tree: newTreeSha,
    parents: headSha ? [headSha] : [],
  }

  const createCommitRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'VX-Studio-Workspace',
    },
    body: JSON.stringify(commitPayload),
  })

  if (!createCommitRes.ok) {
    const errText = await createCommitRes.text()
    throw new Error(`Failed to create commit on GitHub (${createCommitRes.status}): ${errText}`)
  }

  const newCommit = await createCommitRes.json()
  const newCommitSha = newCommit.sha

  let updateRefRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'VX-Studio-Workspace',
    },
    body: JSON.stringify({
      sha: newCommitSha,
      force: false,
    }),
  })

  if (!updateRefRes.ok && updateRefRes.status === 404) {
    updateRefRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'VX-Studio-Workspace',
      },
      body: JSON.stringify({
        ref: `refs/heads/${branch}`,
        sha: newCommitSha,
      }),
    })
  }

  if (!updateRefRes.ok) {
    const errText = await updateRefRes.text()
    throw new Error(`Failed to push commit to branch '${branch}' on GitHub (${updateRefRes.status}): ${errText}`)
  }

  const links = loadGitLinks()
  if (links[projectId]) {
    links[projectId].lastCommitSha = newCommitSha
    links[projectId].lastCommitMessage = message
    links[projectId].lastCommitAt = new Date().toISOString()
    links[projectId].lastPushAt = new Date().toISOString()
    saveGitLinks(links)
  }

  return {
    success: true,
    commitSha: newCommitSha,
    commitMessage: message,
    branch,
    htmlUrl: `https://github.com/${owner}/${repo}/commit/${newCommitSha}`,
    filesCommitted: files.length,
  }
}

export async function getCommitHistory(
  userId: string,
  projectId: string,
  limit = 20
): Promise<GitHubCommitItem[]> {
  const token = getUserToken(userId)
  if (!token) return []

  const link = getProjectLink(projectId)
  if (!link) return []

  const [owner, repo] = link.repoFullName.split('/')
  const branch = link.branch || 'main'

  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits?sha=${branch}&per_page=${limit}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'VX-Studio-Workspace',
      },
    })

    if (!res.ok) return []

    const commitsData = await res.json()
    if (!Array.isArray(commitsData)) return []

    return commitsData.map((c: any) => ({
      sha: c.sha ? c.sha.substring(0, 7) : '',
      message: c.commit?.message || '',
      authorName: c.commit?.author?.name || c.author?.login || 'VX User',
      authorAvatar: c.author?.avatar_url,
      date: c.commit?.author?.date || '',
      htmlUrl: c.html_url || `https://github.com/${owner}/${repo}/commit/${c.sha}`,
    }))
  } catch {
    return []
  }
}
