import { useState, useEffect, useCallback, useRef } from 'react'
import { Icon } from '../ui/Icon'
import { authFetch } from '../../lib/api'
import type {
  GitCommitResult,
  GitHubCommitItem,
  GitHubRepo,
  ProjectGitStatus,
} from '@/lib/github/types'
import type {
  ProjectVercelConfig,
  VercelDeployment,
  VercelDeploymentLog,
} from '@/lib/vercel/types'
import './deploy.css'

interface GitHubDeploySurfaceProps {
  projectId: string
  projectName?: string
}

type TabType = 'git' | 'deploy' | 'history' | 'settings'

export function GitHubDeploySurface({ projectId, projectName }: GitHubDeploySurfaceProps) {
  const [tab, setTab] = useState<TabType>('git')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)

  // GitHub State
  const [gitStatus, setGitStatus] = useState<ProjectGitStatus | null>(null)
  const [commitMsg, setCommitMsg] = useState('')
  const [committing, setCommitting] = useState(false)
  const [commitResult, setCommitResult] = useState<GitCommitResult | null>(null)
  const [commitHistory, setCommitHistory] = useState<GitHubCommitItem[]>([])

  // Vercel State
  const [vercelConfig, setVercelConfig] = useState<ProjectVercelConfig | null>(null)
  const [detectedFramework, setDetectedFramework] = useState<string>('nextjs')
  const [vercelAccount, setVercelAccount] = useState<{ username: string; name?: string } | null>(null)
  const [deployTarget, setDeployTarget] = useState<'production' | 'preview'>('production')
  const [deploying, setDeploying] = useState(false)
  const [currentDeployment, setCurrentDeployment] = useState<VercelDeployment | null>(null)
  const [deployLogs, setDeployLogs] = useState<VercelDeploymentLog[]>([])
  const [deploymentsList, setDeploymentsList] = useState<VercelDeployment[]>([])

  // Modals
  const [showConnectGitHubModal, setShowConnectGitHubModal] = useState(false)
  const [githubTokenInput, setGithubTokenInput] = useState('')
  const [showSelectRepoModal, setShowSelectRepoModal] = useState(false)
  const [userRepos, setUserRepos] = useState<GitHubRepo[]>([])
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [showCreateRepoModal, setShowCreateRepoModal] = useState(false)
  const [newRepoName, setNewRepoName] = useState(
    (projectName || 'my-project').toLowerCase().replace(/[^a-z0-9_-]/g, '-')
  )
  const [newRepoDesc, setNewRepoDesc] = useState('')
  const [newRepoPrivate, setNewRepoPrivate] = useState(false)

  const [showConnectVercelModal, setShowConnectVercelModal] = useState(false)
  const [vercelTokenInput, setVercelTokenInput] = useState('')

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setError(null)
      const gitRes = await authFetch(`/api/projects/${projectId}/github`)
      if (gitRes.ok) {
        const gData: ProjectGitStatus = await gitRes.json()
        setGitStatus(gData)
      }

      const [vCfgRes, vAccRes, vDeploymentsRes] = await Promise.all([
        authFetch(`/api/projects/${projectId}/vercel`),
        authFetch('/api/vercel/account'),
        authFetch(`/api/projects/${projectId}/vercel/deployments`),
      ])

      if (vCfgRes.ok) {
        const vData = await vCfgRes.json()
        setVercelConfig(vData.config)
        setDetectedFramework(vData.detectedFramework || 'nextjs')
      }

      if (vAccRes.ok) {
        const accData = await vAccRes.json()
        if (accData.connected && accData.account) {
          setVercelAccount(accData.account)
        } else {
          setVercelAccount(null)
        }
      }

      if (vDeploymentsRes.ok) {
        const dData = await vDeploymentsRes.json()
        setDeploymentsList(dData.deployments || [])
        if (dData.deployments && dData.deployments.length > 0 && !currentDeployment) {
          setCurrentDeployment(dData.deployments[0])
        }
      }

      const commitsRes = await authFetch(`/api/projects/${projectId}/github/commits`)
      if (commitsRes.ok) {
        const cData = await commitsRes.json()
        setCommitHistory(cData.commits || [])
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load project deployment data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [projectId, currentDeployment])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchData()
  }, [fetchData])

  // Polling for active deployment status and logs
  useEffect(() => {
    if (
      currentDeployment &&
      (currentDeployment.readyState === 'BUILDING' ||
        currentDeployment.readyState === 'INITIALIZING' ||
        currentDeployment.readyState === 'QUEUED')
    ) {
      pollIntervalRef.current = setInterval(async () => {
        try {
          const statusRes = await authFetch(
            `/api/projects/${projectId}/vercel/deployments/${currentDeployment.id}`
          )
          if (statusRes.ok) {
            const data = await statusRes.json()
            setCurrentDeployment(data.deployment)
            if (
              data.deployment.readyState === 'READY' ||
              data.deployment.readyState === 'ERROR' ||
              data.deployment.readyState === 'CANCELED'
            ) {
              if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
              fetchData()
            }
          }

          const logsRes = await authFetch(
            `/api/projects/${projectId}/vercel/deployments/${currentDeployment.id}/logs`
          )
          if (logsRes.ok) {
            const lData = await logsRes.json()
            setDeployLogs(lData.logs || [])
          }
        } catch {
          // ignore transient poll error
        }
      }, 3000)
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [currentDeployment, projectId, fetchData])

  const handleConnectGitHub = async () => {
    if (!githubTokenInput.trim()) return
    try {
      setLoading(true)
      const res = await authFetch('/api/github/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: githubTokenInput.trim() }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to connect GitHub account')
      }
      setShowConnectGitHubModal(false)
      setGithubTokenInput('')
      await fetchData()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDisconnectGitHub = async () => {
    if (!confirm('Disconnect your GitHub account from VX?')) return
    try {
      await authFetch('/api/github/account', { method: 'DELETE' })
      await fetchData()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleOpenSelectRepo = async () => {
    setShowSelectRepoModal(true)
    setLoadingRepos(true)
    try {
      const res = await authFetch(`/api/projects/${projectId}/github/repos`)
      if (res.ok) {
        const data = await res.json()
        setUserRepos(data.repos || [])
      }
    } catch (err: any) {
      alert(err.message)
    } finally {
      setLoadingRepos(false)
    }
  }

  const handleLinkRepo = async (repoFullName: string, isPrivate: boolean) => {
    try {
      setLoading(true)
      const res = await authFetch(`/api/projects/${projectId}/github`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoFullName, branch: 'main', isPrivate }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to link repository')
      }
      setShowSelectRepoModal(false)
      await fetchData()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateRepo = async () => {
    if (!newRepoName.trim()) return
    try {
      setLoading(true)
      const res = await authFetch(`/api/projects/${projectId}/github/repos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newRepoName.trim(),
          description: newRepoDesc.trim(),
          isPrivate: newRepoPrivate,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create repository')
      }
      const data = await res.json()
      await handleLinkRepo(data.repo.full_name, data.repo.private)
      setShowCreateRepoModal(false)
    } catch (err: any) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleUnlinkRepo = async () => {
    if (!confirm('Unlink this repository from the VX project?')) return
    try {
      await authFetch(`/api/projects/${projectId}/github`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unlink' }),
      })
      await fetchData()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleCommitAndPush = async () => {
    if (!commitMsg.trim()) return
    setCommitting(true)
    setCommitResult(null)
    try {
      const res = await authFetch(`/api/projects/${projectId}/github/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: commitMsg.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Commit failed')
      }
      setCommitResult(data)
      setCommitMsg('')
      await fetchData()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setCommitting(false)
    }
  }

  const handleConnectVercel = async () => {
    if (!vercelTokenInput.trim()) return
    try {
      setLoading(true)
      const res = await authFetch('/api/vercel/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: vercelTokenInput.trim() }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to connect Vercel token')
      }
      setShowConnectVercelModal(false)
      setVercelTokenInput('')
      await fetchData()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDisconnectVercel = async () => {
    if (!confirm('Disconnect Vercel account?')) return
    try {
      await authFetch('/api/vercel/account', { method: 'DELETE' })
      await fetchData()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleDeployToVercel = async () => {
    setDeploying(true)
    setError(null)
    try {
      const res = await authFetch(`/api/projects/${projectId}/vercel/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: deployTarget,
          syncEnvVars: vercelConfig?.syncEnvVars ?? true,
          commitMessage: gitStatus?.lastCommit?.message || 'Deploy from VX Workspace',
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Deployment failed to initiate')
      }
      setCurrentDeployment(data.deployment)
      setTab('deploy')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setDeploying(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopyFeedback('Link copied!')
    setTimeout(() => setCopyFeedback(null), 2000)
  }

  const handleRefresh = () => {
    setRefreshing(true)
    void fetchData()
  }

  return (
    <div className="deploy-container">
      {/* Top Toolbar */}
      <div className="deploy-toolbar">
        <div className="deploy-toolbar-left">
          <span className="deploy-title">GitHub & Deployment</span>

          {gitStatus?.hasAccount ? (
            <span className="deploy-badge connected" title={`Connected as ${gitStatus.user?.login}`}>
              <Icon name="github" size={13} />
              @{gitStatus.user?.login}
            </span>
          ) : (
            <button
              className="deploy-badge warning"
              style={{ cursor: 'pointer' }}
              onClick={() => setShowConnectGitHubModal(true)}
            >
              <Icon name="github" size={13} />
              Connect GitHub
            </button>
          )}

          {vercelAccount ? (
            <span className="deploy-badge connected" title={`Connected to Vercel (${vercelAccount.username})`}>
              <Icon name="vercel" size={12} />
              Vercel Connected
            </span>
          ) : (
            <button
              className="deploy-badge warning"
              style={{ cursor: 'pointer' }}
              onClick={() => setShowConnectVercelModal(true)}
            >
              <Icon name="vercel" size={12} />
              Connect Vercel
            </button>
          )}
        </div>

        <div className="deploy-toolbar-right">
          <button
            className="deploy-btn-icon"
            onClick={handleRefresh}
            title="Refresh Status"
            disabled={refreshing}
          >
            <Icon name="refresh" size={14} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Navigation Pills */}
      <div className="deploy-nav-pills">
        <button
          className={`deploy-pill ${tab === 'git' ? 'active' : ''}`}
          onClick={() => setTab('git')}
        >
          <Icon name="github" size={14} />
          Git Repository & Push
          {gitStatus?.totalChanges ? (
            <span
              style={{
                background: '#f59e0b',
                color: '#000',
                padding: '1px 5px',
                borderRadius: '10px',
                fontSize: '10px',
                fontWeight: 700,
              }}
            >
              {gitStatus.totalChanges}
            </span>
          ) : null}
        </button>

        <button
          className={`deploy-pill ${tab === 'deploy' ? 'active' : ''}`}
          onClick={() => setTab('deploy')}
        >
          <Icon name="vercel" size={14} />
          Vercel Deployments
          {currentDeployment?.readyState === 'READY' ? (
            <span style={{ color: '#4ade80', fontSize: '11px' }}>●</span>
          ) : currentDeployment?.readyState === 'BUILDING' ? (
            <span style={{ color: '#38bdf8', fontSize: '11px' }}>◌</span>
          ) : null}
        </button>

        <button
          className={`deploy-pill ${tab === 'history' ? 'active' : ''}`}
          onClick={() => setTab('history')}
        >
          <Icon name="gitCommit" size={14} />
          Commit History
        </button>

        <button
          className={`deploy-pill ${tab === 'settings' ? 'active' : ''}`}
          onClick={() => setTab('settings')}
        >
          <Icon name="settings" size={14} />
          Settings
        </button>
      </div>

      {/* Main Content Area */}
      <div className="deploy-content">
        {error && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '6px',
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              color: '#f87171',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer' }}
            >
              ×
            </button>
          </div>
        )}

        {/* TAB 1: GIT REPOSITORY & PUSH */}
        {tab === 'git' && (
          <>
            {!gitStatus?.hasAccount ? (
              <div className="deploy-card">
                <div className="deploy-card-header">
                  <div className="deploy-card-title">
                    <Icon name="github" size={18} />
                    Connect Your GitHub Account
                  </div>
                </div>
                <p className="deploy-card-desc">
                  Connect your GitHub account to push project code directly, sync repositories, and enable continuous Vercel deployments.
                </p>
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <button
                    className="deploy-btn deploy-btn-primary"
                    onClick={() => setShowConnectGitHubModal(true)}
                  >
                    <Icon name="key" size={14} />
                    Connect with Personal Access Token
                  </button>
                </div>
              </div>
            ) : !gitStatus.link ? (
              <div className="deploy-card">
                <div className="deploy-card-header">
                  <div className="deploy-card-title">
                    <Icon name="gitBranch" size={16} />
                    Link GitHub Repository
                  </div>
                  <span className="deploy-badge">Not Linked</span>
                </div>
                <p className="deploy-card-desc">
                  This VX project is not yet linked to a GitHub repository. You can create a new repository or link an existing one.
                </p>

                <div style={{ display: 'flex', gap: '10px', marginTop: '6px', flexWrap: 'wrap' }}>
                  <button
                    className="deploy-btn deploy-btn-primary"
                    onClick={() => setShowCreateRepoModal(true)}
                  >
                    <Icon name="plus" size={14} />
                    Create New Repository
                  </button>
                  <button
                    className="deploy-btn deploy-btn-secondary"
                    onClick={handleOpenSelectRepo}
                  >
                    <Icon name="folder" size={14} />
                    Select Existing Repository
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="deploy-card">
                  <div className="deploy-card-header">
                    <div className="deploy-card-title">
                      <Icon name="github" size={16} />
                      <a
                        href={gitStatus.link.repoUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: '#60a5fa', textDecoration: 'none' }}
                      >
                        {gitStatus.link.repoFullName}
                      </a>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="deploy-badge connected">
                        <Icon name="gitBranch" size={12} />
                        {gitStatus.branch || 'main'}
                      </span>
                      {gitStatus.link.isPrivate && (
                        <span className="deploy-badge">
                          <Icon name="lock" size={11} />
                          Private
                        </span>
                      )}
                      <button
                        className="deploy-btn-icon"
                        onClick={handleUnlinkRepo}
                        title="Unlink Repository"
                      >
                        <Icon name="close" size={13} />
                      </button>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '8px 12px',
                      background: 'rgba(255, 255, 255, 0.03)',
                      borderRadius: '6px',
                      fontSize: '12px',
                    }}
                  >
                    <span style={{ color: 'var(--text-muted, #a1a1aa)' }}>Project Status:</span>
                    {gitStatus.totalChanges > 0 ? (
                      <span style={{ color: '#facc15', fontWeight: 600 }}>
                        {gitStatus.totalChanges} uncommitted changes ready
                      </span>
                    ) : (
                      <span style={{ color: '#4ade80', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Icon name="check" size={13} />
                        Up to date with GitHub
                      </span>
                    )}
                  </div>

                  <div className="deploy-secret-notice">
                    <Icon name="lock" size={14} />
                    <span>
                      <strong>Secret Protection Active:</strong> Sensitive files (<code>.env</code>, <code>.env.local</code>, private keys, API secrets) are automatically stripped before committing.
                    </span>
                  </div>

                  {gitStatus.totalChanges > 0 && (
                    <div className="deploy-form-group">
                      <label className="deploy-label">Changed Files to Commit</label>
                      <div className="deploy-file-list">
                        {gitStatus.addedFiles.map((file) => (
                          <div key={file} className="deploy-file-item">
                            <span>{file}</span>
                            <span className="deploy-file-tag added">Added</span>
                          </div>
                        ))}
                        {gitStatus.modifiedFiles.map((file) => (
                          <div key={file} className="deploy-file-item">
                            <span>{file}</span>
                            <span className="deploy-file-tag modified">Modified</span>
                          </div>
                        ))}
                        {gitStatus.deletedFiles.map((file) => (
                          <div key={file} className="deploy-file-item">
                            <span>{file}</span>
                            <span className="deploy-file-tag deleted">Deleted</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="deploy-form-group" style={{ marginTop: '4px' }}>
                    <label className="deploy-label">Commit Message</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        className="deploy-input"
                        style={{ flex: 1 }}
                        placeholder="e.g. Build barbershop homepage"
                        value={commitMsg}
                        onChange={(e) => setCommitMsg(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !committing) {
                            handleCommitAndPush()
                          }
                        }}
                      />
                      <button
                        className="deploy-btn deploy-btn-primary"
                        onClick={handleCommitAndPush}
                        disabled={committing || !commitMsg.trim()}
                      >
                        {committing ? (
                          <>
                            <Icon name="refresh" size={14} className="animate-spin" />
                            Pushing...
                          </>
                        ) : (
                          <>
                            <Icon name="arrowUp" size={14} />
                            Commit & Push
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {commitResult && (
                    <div
                      style={{
                        padding: '10px 14px',
                        background: 'rgba(34, 197, 94, 0.1)',
                        border: '1px solid rgba(34, 197, 94, 0.25)',
                        borderRadius: '6px',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <strong style={{ color: '#4ade80' }}>Pushed successfully! </strong>
                        <span>Commit {commitResult.commitSha?.substring(0, 7)}: {commitResult.commitMessage}</span>
                      </div>
                      {commitResult.htmlUrl && (
                        <a
                          href={commitResult.htmlUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="deploy-btn deploy-btn-secondary"
                          style={{ padding: '3px 8px', fontSize: '11px' }}
                        >
                          View on GitHub
                          <Icon name="externalLink" size={12} />
                        </a>
                      )}
                    </div>
                  )}
                </div>

                {gitStatus.lastCommit && (
                  <div className="deploy-card">
                    <div className="deploy-card-header">
                      <div className="deploy-card-title">
                        <Icon name="gitCommit" size={15} />
                        Latest Commit on {gitStatus.branch}
                      </div>
                      <a
                        href={gitStatus.lastCommit.htmlUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="deploy-sha-badge"
                      >
                        {gitStatus.lastCommit.sha}
                      </a>
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 500 }}>
                      {gitStatus.lastCommit.message}
                    </div>
                    <div className="deploy-commit-meta">
                      <span>By {gitStatus.lastCommit.authorName}</span>
                      <span>•</span>
                      <span>{new Date(gitStatus.lastCommit.date).toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* TAB 2: VERCEL DEPLOYMENTS */}
        {tab === 'deploy' && (
          <>
            {!vercelAccount ? (
              <div className="deploy-card">
                <div className="deploy-card-header">
                  <div className="deploy-card-title">
                    <Icon name="vercel" size={18} />
                    Connect Vercel for Real Deployments
                  </div>
                </div>
                <p className="deploy-card-desc">
                  Connect your Vercel account or token to deploy this project live to the web with instant previews, global CDN, and real build logs.
                </p>
                <div style={{ marginTop: '6px' }}>
                  <button
                    className="deploy-btn deploy-btn-primary"
                    onClick={() => setShowConnectVercelModal(true)}
                  >
                    <Icon name="key" size={14} />
                    Connect Vercel Access Token
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="deploy-card">
                  <div className="deploy-card-header">
                    <div className="deploy-card-title">
                      <Icon name="rocket" size={16} />
                      Deploy Project
                    </div>
                    <span className="deploy-badge" style={{ textTransform: 'capitalize' }}>
                      Framework: {detectedFramework}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', fontSize: '12px' }}>
                    <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '8px 12px', borderRadius: '6px' }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Project Name</div>
                      <strong style={{ fontSize: '12px' }}>{vercelConfig?.vercelProjectName || projectName || 'vx-project'}</strong>
                    </div>
                    <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '8px 12px', borderRadius: '6px' }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Branch</div>
                      <strong style={{ fontSize: '12px' }}>{gitStatus?.branch || 'main'}</strong>
                    </div>
                    <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '8px 12px', borderRadius: '6px' }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Environment</div>
                      <select
                        value={deployTarget}
                        onChange={(e) => setDeployTarget(e.target.value as 'production' | 'preview')}
                        style={{
                          background: 'transparent',
                          color: '#fff',
                          border: 'none',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          outline: 'none',
                        }}
                      >
                        <option value="production" style={{ background: '#18181b' }}>Production</option>
                        <option value="preview" style={{ background: '#18181b' }}>Preview</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginTop: '4px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={vercelConfig?.syncEnvVars ?? true}
                        onChange={(e) => {
                          const val = e.target.checked
                          setVercelConfig((prev) => (prev ? { ...prev, syncEnvVars: val } : null))
                          authFetch(`/api/projects/${projectId}/vercel`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ syncEnvVars: val }),
                          })
                        }}
                      />
                      <span>Sync safe project environment variables</span>
                    </label>

                    <button
                      className="deploy-btn deploy-btn-primary"
                      style={{ padding: '8px 18px', fontSize: '13px' }}
                      onClick={handleDeployToVercel}
                      disabled={deploying}
                    >
                      {deploying ? (
                        <>
                          <Icon name="refresh" size={15} className="animate-spin" />
                          Initiating Deployment...
                        </>
                      ) : (
                        <>
                          <Icon name="rocket" size={15} />
                          Deploy to {deployTarget === 'production' ? 'Production' : 'Preview'}
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Current / Active Deployment Card */}
                {currentDeployment && (
                  <div className="deploy-card">
                    <div className="deploy-card-header">
                      <div className="deploy-card-title">
                        <Icon name="globe" size={16} />
                        Active Deployment
                      </div>
                      <span
                        className={`deploy-badge ${
                          currentDeployment.readyState === 'READY'
                            ? 'connected'
                            : currentDeployment.readyState === 'ERROR'
                            ? 'warning'
                            : ''
                        }`}
                      >
                        {currentDeployment.readyState}
                      </span>
                    </div>

                    {currentDeployment.readyState === 'READY' && currentDeployment.url && (
                      <div className="deploy-live-hero">
                        <div>
                          <div style={{ fontSize: '11px', color: '#86efac', textTransform: 'uppercase', fontWeight: 600 }}>
                            Live Deployment URL
                          </div>
                          <a
                            href={currentDeployment.url}
                            target="_blank"
                            rel="noreferrer"
                            className="deploy-live-url"
                          >
                            {currentDeployment.url}
                            <Icon name="externalLink" size={14} />
                          </a>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <button
                            className="deploy-btn deploy-btn-secondary"
                            onClick={() => copyToClipboard(currentDeployment.url)}
                          >
                            <Icon name="copy" size={13} />
                            {copyFeedback || 'Copy Link'}
                          </button>
                          <a
                            href={currentDeployment.url}
                            target="_blank"
                            rel="noreferrer"
                            className="deploy-btn deploy-btn-primary"
                            style={{ textDecoration: 'none' }}
                          >
                            <Icon name="externalLink" size={14} />
                            Open App
                          </a>
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', fontSize: '11px' }}>
                      <div style={{ background: 'rgba(255,255,255,0.03)', padding: '6px 10px', borderRadius: '4px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Target: </span>
                        <strong>{currentDeployment.target}</strong>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.03)', padding: '6px 10px', borderRadius: '4px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Created: </span>
                        <strong>{new Date(currentDeployment.createdAt).toLocaleTimeString()}</strong>
                      </div>
                      {currentDeployment.inspectorUrl && (
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '6px 10px', borderRadius: '4px' }}>
                          <a
                            href={currentDeployment.inspectorUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: '#60a5fa', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            <span>Inspect Dashboard</span>
                            <Icon name="externalLink" size={11} />
                          </a>
                        </div>
                      )}
                    </div>

                    <div className="deploy-form-group">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label className="deploy-label">Deployment Build Logs</label>
                        <button
                          className="deploy-btn-icon"
                          onClick={async () => {
                            const res = await authFetch(
                              `/api/projects/${projectId}/vercel/deployments/${currentDeployment.id}/logs`
                            )
                            if (res.ok) {
                              const d = await res.json()
                              setDeployLogs(d.logs || [])
                            }
                          }}
                          title="Refresh logs"
                        >
                          <Icon name="refresh" size={12} />
                        </button>
                      </div>

                      <div className="deploy-console">
                        {deployLogs.length > 0 ? (
                          deployLogs.map((log) => (
                            <div key={log.id} className="deploy-console-line">
                              <span className="deploy-console-time">
                                {new Date(log.timestamp).toLocaleTimeString()}
                              </span>
                              <span
                                className={
                                  log.type === 'stderr'
                                    ? 'deploy-console-err'
                                    : log.type === 'system'
                                    ? 'deploy-console-sys'
                                    : ''
                                }
                              >
                                {log.text}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div style={{ color: '#71717a' }}>
                            [System] Build initiated. Waiting for worker logs from Vercel...
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Deployment History Table */}
                {deploymentsList.length > 0 && (
                  <div className="deploy-card">
                    <div className="deploy-card-header">
                      <div className="deploy-card-title">
                        <Icon name="layers" size={15} />
                        Recent Deployments
                      </div>
                      <span className="deploy-badge">{deploymentsList.length} Total</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {deploymentsList.map((dep) => (
                        <div
                          key={dep.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            background: 'var(--bg-surface, #121214)',
                            borderRadius: '6px',
                            border: '1px solid rgba(255, 255, 255, 0.06)',
                            fontSize: '12px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span
                              style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                background:
                                  dep.readyState === 'READY'
                                    ? '#4ade80'
                                    : dep.readyState === 'ERROR'
                                    ? '#f87171'
                                    : '#38bdf8',
                              }}
                            />
                            <div>
                              <div style={{ fontWeight: 500 }}>{dep.name}</div>
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                {new Date(dep.createdAt).toLocaleString()} • {dep.target}
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {dep.url && (
                              <a
                                href={dep.url}
                                target="_blank"
                                rel="noreferrer"
                                className="deploy-btn deploy-btn-secondary"
                                style={{ padding: '3px 8px', fontSize: '11px' }}
                              >
                                Live URL
                                <Icon name="externalLink" size={11} />
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* TAB 3: COMMIT HISTORY */}
        {tab === 'history' && (
          <div className="deploy-card">
            <div className="deploy-card-header">
              <div className="deploy-card-title">
                <Icon name="gitCommit" size={16} />
                Repository Commit History
              </div>
              <span className="deploy-badge">{commitHistory.length} Commits</span>
            </div>

            {commitHistory.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                No commit history recorded yet. Push changes from the Git tab to start history.
              </div>
            ) : (
              <div className="deploy-commit-list">
                {commitHistory.map((c) => (
                  <div key={c.sha} className="deploy-commit-item">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="deploy-commit-msg">{c.message}</div>
                      <div className="deploy-commit-meta">
                        <span>{c.authorName}</span>
                        <span>•</span>
                        <span>{new Date(c.date).toLocaleString()}</span>
                      </div>
                    </div>
                    <a
                      href={c.htmlUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="deploy-sha-badge"
                    >
                      {c.sha}
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: SETTINGS */}
        {tab === 'settings' && (
          <div className="deploy-card">
            <div className="deploy-card-header">
              <div className="deploy-card-title">
                <Icon name="settings" size={16} />
                Connected Accounts & Integrations
              </div>
            </div>

            {/* GitHub Account */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px',
                background: 'var(--bg-surface, #121214)',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Icon name="github" size={20} />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>GitHub</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {gitStatus?.hasAccount
                      ? `Connected as @${gitStatus.user?.login}`
                      : 'Not connected'}
                  </div>
                </div>
              </div>

              {gitStatus?.hasAccount ? (
                <button className="deploy-btn deploy-btn-danger" onClick={handleDisconnectGitHub}>
                  Disconnect
                </button>
              ) : (
                <button
                  className="deploy-btn deploy-btn-secondary"
                  onClick={() => setShowConnectGitHubModal(true)}
                >
                  Connect
                </button>
              )}
            </div>

            {/* Vercel Account */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px',
                background: 'var(--bg-surface, #121214)',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Icon name="vercel" size={18} />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>Vercel</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {vercelAccount
                      ? `Connected (${vercelAccount.username})`
                      : 'Not connected'}
                  </div>
                </div>
              </div>

              {vercelAccount ? (
                <button className="deploy-btn deploy-btn-danger" onClick={handleDisconnectVercel}>
                  Disconnect
                </button>
              ) : (
                <button
                  className="deploy-btn deploy-btn-secondary"
                  onClick={() => setShowConnectVercelModal(true)}
                >
                  Connect
                </button>
              )}
            </div>

            <div className="deploy-secret-notice">
              <Icon name="lock" size={14} />
              <span>
                All access tokens are encrypted with AES-256-GCM at rest and never exposed to the client browser.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: Connect GitHub */}
      {showConnectGitHubModal && (
        <div className="deploy-modal-backdrop" onClick={() => setShowConnectGitHubModal(false)}>
          <div className="deploy-modal" onClick={(e) => e.stopPropagation()}>
            <div className="deploy-card-header">
              <div className="deploy-card-title">
                <Icon name="github" size={18} />
                Connect GitHub
              </div>
              <button className="deploy-btn-icon" onClick={() => setShowConnectGitHubModal(false)}>
                <Icon name="close" size={16} />
              </button>
            </div>
            <p className="deploy-card-desc">
              Paste a GitHub Personal Access Token (classic with <code>repo</code> scope, or fine-grained token with Repository permissions).
            </p>
            <div className="deploy-form-group">
              <label className="deploy-label">Personal Access Token</label>
              <input
                type="password"
                className="deploy-input"
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                value={githubTokenInput}
                onChange={(e) => setGithubTokenInput(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                className="deploy-btn deploy-btn-secondary"
                onClick={() => setShowConnectGitHubModal(false)}
              >
                Cancel
              </button>
              <button
                className="deploy-btn deploy-btn-primary"
                onClick={handleConnectGitHub}
                disabled={!githubTokenInput.trim()}
              >
                Connect GitHub
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Create New Repository */}
      {showCreateRepoModal && (
        <div className="deploy-modal-backdrop" onClick={() => setShowCreateRepoModal(false)}>
          <div className="deploy-modal" onClick={(e) => e.stopPropagation()}>
            <div className="deploy-card-header">
              <div className="deploy-card-title">
                <Icon name="plus" size={18} />
                Create GitHub Repository
              </div>
              <button className="deploy-btn-icon" onClick={() => setShowCreateRepoModal(false)}>
                <Icon name="close" size={16} />
              </button>
            </div>
            <div className="deploy-form-group">
              <label className="deploy-label">Repository Name</label>
              <input
                type="text"
                className="deploy-input"
                placeholder="my-cool-project"
                value={newRepoName}
                onChange={(e) => setNewRepoName(e.target.value)}
              />
            </div>
            <div className="deploy-form-group">
              <label className="deploy-label">Description (Optional)</label>
              <input
                type="text"
                className="deploy-input"
                placeholder="Created with VX Dev Workspace"
                value={newRepoDesc}
                onChange={(e) => setNewRepoDesc(e.target.value)}
              />
            </div>
            <div className="deploy-form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={newRepoPrivate}
                  onChange={(e) => setNewRepoPrivate(e.target.checked)}
                />
                <span>Private Repository (recommended for proprietary projects)</span>
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                className="deploy-btn deploy-btn-secondary"
                onClick={() => setShowCreateRepoModal(false)}
              >
                Cancel
              </button>
              <button
                className="deploy-btn deploy-btn-primary"
                onClick={handleCreateRepo}
                disabled={!newRepoName.trim()}
              >
                Create & Link
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Select Existing Repository */}
      {showSelectRepoModal && (
        <div className="deploy-modal-backdrop" onClick={() => setShowSelectRepoModal(false)}>
          <div className="deploy-modal" onClick={(e) => e.stopPropagation()}>
            <div className="deploy-card-header">
              <div className="deploy-card-title">
                <Icon name="folder" size={18} />
                Select Existing Repository
              </div>
              <button className="deploy-btn-icon" onClick={() => setShowSelectRepoModal(false)}>
                <Icon name="close" size={16} />
              </button>
            </div>
            {loadingRepos ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                Loading your repositories from GitHub...
              </div>
            ) : userRepos.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No repositories found on this GitHub account.
              </div>
            ) : (
              <div style={{ maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {userRepos.map((repo) => (
                  <button
                    key={repo.id}
                    onClick={() => handleLinkRepo(repo.full_name, repo.private)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: 'var(--bg-surface, #121214)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '6px',
                      color: 'var(--text)',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 500 }}>{repo.full_name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        Default branch: {repo.default_branch}
                      </div>
                    </div>
                    {repo.private && <Icon name="lock" size={13} />}
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button
                className="deploy-btn deploy-btn-secondary"
                onClick={() => setShowSelectRepoModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Connect Vercel Token */}
      {showConnectVercelModal && (
        <div className="deploy-modal-backdrop" onClick={() => setShowConnectVercelModal(false)}>
          <div className="deploy-modal" onClick={(e) => e.stopPropagation()}>
            <div className="deploy-card-header">
              <div className="deploy-card-title">
                <Icon name="vercel" size={18} />
                Connect Vercel Token
              </div>
              <button className="deploy-btn-icon" onClick={() => setShowConnectVercelModal(false)}>
                <Icon name="close" size={16} />
              </button>
            </div>
            <p className="deploy-card-desc">
              Generate a Vercel Personal Access Token from your{' '}
              <a
                href="https://vercel.com/account/tokens"
                target="_blank"
                rel="noreferrer"
                style={{ color: '#60a5fa' }}
              >
                Vercel Account Settings
              </a>{' '}
              and paste it here.
            </p>
            <div className="deploy-form-group">
              <label className="deploy-label">Vercel Token</label>
              <input
                type="password"
                className="deploy-input"
                placeholder="Vercel Access Token"
                value={vercelTokenInput}
                onChange={(e) => setVercelTokenInput(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                className="deploy-btn deploy-btn-secondary"
                onClick={() => setShowConnectVercelModal(false)}
              >
                Cancel
              </button>
              <button
                className="deploy-btn deploy-btn-primary"
                onClick={handleConnectVercel}
                disabled={!vercelTokenInput.trim()}
              >
                Connect Vercel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
