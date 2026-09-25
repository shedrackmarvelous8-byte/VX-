'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Icon } from '../ui/Icon'
import { authFetch } from '../../lib/api'
import type { AndroidBuildJob, ProjectArtifact, ShareableLink } from '@/lib/db/types'

interface AndroidBuildSectionProps {
  projectId: string
  projectName?: string
}

interface ValidationData {
  valid: boolean
  errors: string[]
  warnings: string[]
  appName: string
  appId: string
  version: string
  versionCode: number
  fileCount: number
}

export function AndroidBuildSection({ projectId, projectName }: AndroidBuildSectionProps) {
  const [validation, setValidation] = useState<ValidationData | null>(null)
  const [isValidating, setIsValidating] = useState(false)
  const [isBuilding, setIsBuilding] = useState(false)
  const [jobs, setJobs] = useState<AndroidBuildJob[]>([])
  const [artifacts, setArtifacts] = useState<ProjectArtifact[]>([])
  const [activeJob, setActiveJob] = useState<AndroidBuildJob | null>(null)
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [showLogsJobId, setShowLogsJobId] = useState<string | null>(null)
  const [showQrArtifactId, setShowQrArtifactId] = useState<string | null>(null)
  const [shareLinksMap, setShareLinksMap] = useState<Record<string, { shareUrl: string; shareLink: ShareableLink }>>({})
  const [versionInput, setVersionInput] = useState('1.0.0')
  const [versionCodeInput, setVersionCodeInput] = useState(1)
  const [errorNotice, setErrorNotice] = useState<string | null>(null)
  const [toastNotice, setToastNotice] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToastNotice(msg)
    setTimeout(() => setToastNotice(null), 3000)
  }

  const runValidation = useCallback(async () => {
    setIsValidating(true)
    setErrorNotice(null)
    try {
      const res = await authFetch(`/api/mobile/build?projectId=${encodeURIComponent(projectId)}&validateOnly=true`)
      if (res.ok) {
        const data = await res.json()
        if (data.validation) {
          setValidation(data.validation)
          if (data.validation.version) setVersionInput(data.validation.version)
          if (data.validation.versionCode) setVersionCodeInput(data.validation.versionCode)
        }
      }
    } catch {
      setErrorNotice('Failed to validate mobile project configuration.')
    } finally {
      setIsValidating(false)
    }
  }, [projectId])

  const fetchJobsAndArtifacts = useCallback(async () => {
    try {
      const [jobsRes, artifactsRes] = await Promise.all([
        authFetch(`/api/mobile/build?projectId=${encodeURIComponent(projectId)}`),
        authFetch(`/api/mobile/artifacts?projectId=${encodeURIComponent(projectId)}`),
      ])

      if (jobsRes.ok) {
        const jobsData = await jobsRes.json()
        if (Array.isArray(jobsData.jobs)) {
          setJobs(jobsData.jobs)
          const running = jobsData.jobs.find(
            (j: AndroidBuildJob) => j.status === 'queued' || j.status === 'preparing' || j.status === 'building' || j.status === 'processing'
          )
          setActiveJob(running || null)
        }
      }

      if (artifactsRes.ok) {
        const artData = await artifactsRes.json()
        if (Array.isArray(artData.artifacts)) {
          setArtifacts(artData.artifacts)
        }
      }
    } catch {
      // Ignore background refresh errors
    }
  }, [projectId])

  useEffect(() => {
    let isMounted = true
    async function init() {
      if (isMounted) {
        runValidation()
        fetchJobsAndArtifacts()
      }
    }
    init()

    const interval = setInterval(fetchJobsAndArtifacts, 3000)
    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [runValidation, fetchJobsAndArtifacts])

  const handleStartBuild = async () => {
    setShowReviewModal(false)
    setIsBuilding(true)
    setErrorNotice(null)
    try {
      const res = await authFetch('/api/mobile/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          version: versionInput,
          versionCode: Number(versionCodeInput) || 1,
        }),
      })

      const data = await res.json()
      if (res.ok && data.job) {
        showToast('Android APK build job queued!')
        fetchJobsAndArtifacts()
      } else {
        setErrorNotice(data.error || 'Failed to queue Android APK build.')
      }
    } catch {
      setErrorNotice('Network error encountered while triggering build.')
    } finally {
      setIsBuilding(false)
    }
  }

  const handleCancelJob = async (jobId: string) => {
    try {
      const res = await authFetch(`/api/mobile/build/${jobId}`, { method: 'DELETE' })
      if (res.ok) {
        showToast('Build job cancelled.')
        fetchJobsAndArtifacts()
      }
    } catch {
      // Ignore
    }
  }

  const handleGetShareLink = async (artifactId: string) => {
    try {
      const res = await authFetch(`/api/mobile/artifacts/${artifactId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_share_link' }),
      })
      if (res.ok) {
        const data = await res.json()
        setShareLinksMap((prev) => ({
          ...prev,
          [artifactId]: { shareUrl: data.shareUrl, shareLink: data.shareLink },
        }))
        return data.shareUrl
      }
    } catch {
      // Ignore
    }
    return null
  }

  const handleCopyShareLink = async (artifactId: string) => {
    let linkInfo = shareLinksMap[artifactId]
    let url = linkInfo?.shareUrl
    if (!url) {
      url = await handleGetShareLink(artifactId)
    }
    if (url) {
      navigator.clipboard.writeText(url)
      showToast('Download link copied to clipboard!')
    }
  }

  const handleToggleQr = async (artifactId: string) => {
    if (showQrArtifactId === artifactId) {
      setShowQrArtifactId(null)
    } else {
      if (!shareLinksMap[artifactId]) {
        await handleGetShareLink(artifactId)
      }
      setShowQrArtifactId(artifactId)
    }
  }

  const handleDeleteArtifact = async (artifactId: string) => {
    try {
      const res = await authFetch(`/api/mobile/artifacts/${artifactId}`, { method: 'DELETE' })
      if (res.ok) {
        showToast('APK artifact deleted.')
        fetchJobsAndArtifacts()
      }
    } catch {
      // Ignore
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
      {/* Toast Notice */}
      {toastNotice && (
        <div style={{
          background: '#22c55e',
          color: '#000',
          padding: '8px 14px',
          borderRadius: '8px',
          fontSize: '12px',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <Icon name="check" size={14} />
          <span>{toastNotice}</span>
        </div>
      )}

      {/* Error Banner */}
      {errorNotice && (
        <div style={{
          background: '#451a1a',
          border: '1px solid #f87171',
          color: '#fca5a5',
          padding: '10px 14px',
          borderRadius: '8px',
          fontSize: '12px',
        }}>
          {errorNotice}
        </div>
      )}

      {/* Header & Trigger Bar */}
      <div className="build-card" style={{ background: '#141418', border: '1px solid #27272a', padding: '16px', borderRadius: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Icon name="smartphone" size={18} />
              <h3 style={{ margin: 0, fontSize: '15px', color: '#ffffff', fontWeight: 600 }}>
                Android APK Build System
              </h3>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#a1a1aa' }}>
              Generates a real Android APK binary for direct device installation & distribution.
            </p>
          </div>

          <button
            className="surface-tab"
            onClick={() => setShowReviewModal(true)}
            disabled={isBuilding || (validation && !validation.valid) || Boolean(activeJob)}
            style={{
              padding: '8px 16px',
              background: activeJob ? '#27272a' : '#22c55e',
              color: activeJob ? '#a1a1aa' : '#000000',
              fontWeight: 600,
              fontSize: '13px',
              borderRadius: '8px',
              border: 'none',
              cursor: activeJob || (validation && !validation.valid) ? 'not-allowed' : 'pointer',
            }}
          >
            <Icon name="play" size={14} />
            {activeJob ? 'Build Running...' : 'Build Android APK'}
          </button>
        </div>

        {/* Validation Status Summary */}
        {validation && (
          <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #27272a', fontSize: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{
                color: validation.valid ? '#4ade80' : '#f87171',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}>
                <Icon name={validation.valid ? 'check' : 'alert'} size={14} />
                {validation.valid ? 'Pre-build Validation Passed' : 'Pre-build Validation Blocked'}
              </span>
              <span style={{ color: '#71717a' }}>•</span>
              <span style={{ color: '#d4d4d8' }}>App: <strong>{validation.appName}</strong> ({validation.appId})</span>
              <span style={{ color: '#71717a' }}>•</span>
              <span style={{ color: '#d4d4d8' }}>v{validation.version} (Code {validation.versionCode})</span>
              <button
                onClick={runValidation}
                disabled={isValidating}
                style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline' }}
              >
                {isValidating ? 'Re-checking...' : 'Re-check'}
              </button>
            </div>

            {/* Validation errors */}
            {validation.errors.length > 0 && (
              <div style={{ marginTop: '8px', background: '#261212', padding: '10px', borderRadius: '6px', border: '1px solid #7f1d1d' }}>
                <div style={{ color: '#f87171', fontWeight: 600, marginBottom: '4px' }}>Validation Blockers ({validation.errors.length}):</div>
                {validation.errors.map((err, i) => (
                  <div key={i} style={{ color: '#fca5a5', fontSize: '11px', marginBottom: '2px' }}>• {err}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Active Job Tracker */}
      {activeJob && (
        <div className="build-card" style={{ background: '#1c1917', border: '1px solid #78350f', padding: '16px', borderRadius: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="status-pill status-pill--starting">
                <span className="status-dot" />
                {activeJob.status.toUpperCase()}
              </span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#fef3c7' }}>
                Building Android APK v{activeJob.version} (Code {activeJob.version_code})
              </span>
            </div>
            <button
              onClick={() => handleCancelJob(activeJob.id)}
              style={{ background: '#3f1111', border: '1px solid #991b1b', color: '#fca5a5', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}
            >
              Cancel Build
            </button>
          </div>

          <div style={{ background: '#0c0a09', padding: '10px', borderRadius: '6px', fontFamily: 'monospace', fontSize: '11px', color: '#fde68a', maxHeight: '120px', overflowY: 'auto' }}>
            {activeJob.logs.slice(-6).map((log, idx) => (
              <div key={idx}>{log}</div>
            ))}
          </div>
        </div>
      )}

      {/* Artifacts & Downloads History */}
      <div className="build-card" style={{ background: '#141418', border: '1px solid #27272a', padding: '16px', borderRadius: '12px' }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#ffffff', fontWeight: 600 }}>
          Generated Android APK Artifacts ({artifacts.length})
        </h4>

        {artifacts.length === 0 ? (
          <div style={{ fontSize: '12px', color: '#71717a', fontStyle: 'italic', padding: '12px 0' }}>
            No generated Android APK artifacts yet. Click &quot;Build Android APK&quot; above to start your first release build.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {artifacts.map((art) => {
              const linkData = shareLinksMap[art.id]
              const sizeMb = (art.size_bytes / (1024 * 1024)).toFixed(2)

              return (
                <div key={art.id} style={{
                  background: '#18181c',
                  border: '1px solid #27272a',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff' }}>{art.file_name}</span>
                      <span style={{ marginLeft: '8px', fontSize: '11px', color: '#a1a1aa', background: '#27272a', padding: '2px 6px', borderRadius: '4px' }}>
                        v{art.version} (Code {art.version_code})
                      </span>
                      <span style={{ marginLeft: '8px', fontSize: '11px', color: '#a1a1aa' }}>
                        {sizeMb} MB
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {/* Direct Download Button */}
                      <a
                        href={linkData?.shareUrl || `/api/mobile/artifacts/${art.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          background: '#22c55e',
                          color: '#000000',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 600,
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <Icon name="download" size={13} />
                        Download APK
                      </a>

                      {/* Copy Link */}
                      <button
                        onClick={() => handleCopyShareLink(art.id)}
                        style={{ background: '#27272a', border: '1px solid #3f3f46', color: '#ffffff', padding: '6px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}
                      >
                        Copy Link
                      </button>

                      {/* QR Toggle */}
                      <button
                        onClick={() => handleToggleQr(art.id)}
                        style={{ background: '#27272a', border: '1px solid #3f3f46', color: '#ffffff', padding: '6px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}
                      >
                        QR Code
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => handleDeleteArtifact(art.id)}
                        style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '11px', padding: '4px' }}
                        title="Delete APK Artifact"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <div style={{ fontSize: '11px', color: '#71717a', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <span>SHA-256 Digest: <code style={{ color: '#a1a1aa' }}>{art.checksum.slice(0, 24)}...</code></span>
                    <span>Created: {new Date(art.created_at).toLocaleDateString()}</span>
                  </div>

                  {/* QR Code Container display */}
                  {showQrArtifactId === art.id && linkData && (
                    <div style={{ marginTop: '8px', padding: '12px', background: '#121215', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <iframe
                        srcDoc={`<html><body style="margin:0;background:#18181c;display:flex;align-items:center;justify-content:center;height:100vh;"><img src="data:image/svg+xml;utf8,${encodeURIComponent(
                          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#18181c"/><text x="50" y="55" fill="#22c55e" font-size="12" text-anchor="middle">Scan for APK</text></svg>`
                        )}" style="width:120px;height:120px;" /></body></html>`}
                        style={{ width: '130px', height: '130px', border: 'none', borderRadius: '8px' }}
                      />
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#ffffff', marginBottom: '4px' }}>Scan with Android Camera / QR Scanner</div>
                        <div style={{ fontSize: '11px', color: '#a1a1aa', wordBreak: 'break-all', marginBottom: '8px' }}>
                          {linkData.shareUrl}
                        </div>
                        <a
                          href={linkData.shareUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: '11px', color: '#60a5fa', textDecoration: 'underline' }}
                        >
                          Open Download Landing Page
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Build History & Logs */}
      {jobs.length > 0 && (
        <div className="build-card" style={{ background: '#141418', border: '1px solid #27272a', padding: '16px', borderRadius: '12px' }}>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#ffffff', fontWeight: 600 }}>
            Build History & Logs ({jobs.length})
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {jobs.map((job) => (
              <div key={job.id} style={{ background: '#18181c', padding: '10px 12px', borderRadius: '6px', border: '1px solid #27272a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className={`status-pill status-pill--${job.status === 'completed' ? 'running' : job.status === 'failed' ? 'error' : 'starting'}`}>
                    <span className="status-dot" />
                    {job.status}
                  </span>
                  <span style={{ fontSize: '12px', color: '#e4e4e7', fontWeight: 500 }}>
                    Build v{job.version} (Code {job.version_code})
                  </span>
                  <span style={{ fontSize: '11px', color: '#71717a' }}>
                    {new Date(job.created_at).toLocaleTimeString()}
                  </span>
                </div>

                <button
                  onClick={() => setShowLogsJobId(showLogsJobId === job.id ? null : job.id)}
                  style={{ background: '#27272a', border: 'none', color: '#a1a1aa', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}
                >
                  {showLogsJobId === job.id ? 'Hide Logs' : 'View Logs'}
                </button>
              </div>
            ))}
          </div>

          {/* Logs Modal */}
          {showLogsJobId && (
            <div style={{ marginTop: '12px', background: '#09090b', padding: '12px', borderRadius: '8px', border: '1px solid #27272a', maxHeight: '200px', overflowY: 'auto' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#f4f4f5', marginBottom: '8px' }}>Build Logs:</div>
              {jobs.find((j) => j.id === showLogsJobId)?.logs.map((log, idx) => (
                <div key={idx} style={{ fontFamily: 'monospace', fontSize: '11px', color: '#a1a1aa', marginBottom: '2px' }}>{log}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Review Modal */}
      {showReviewModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px',
        }}>
          <div style={{
            background: '#18181c',
            border: '1px solid #27272a',
            borderRadius: '16px',
            padding: '24px',
            maxWidth: '420px',
            width: '100%',
            color: '#ffffff',
          }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>Confirm Android APK Build</h3>
            <p style={{ fontSize: '12px', color: '#a1a1aa', margin: '0 0 16px 0' }}>
              Review application versioning and parameters before initiating the release build.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              <div>
                <label style={{ fontSize: '11px', color: '#71717a', display: 'block', marginBottom: '4px' }}>Version Name</label>
                <input
                  type="text"
                  value={versionInput}
                  onChange={(e) => setVersionInput(e.target.value)}
                  style={{ width: '100%', background: '#09090b', border: '1px solid #27272a', color: '#fff', padding: '8px 12px', borderRadius: '6px', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#71717a', display: 'block', marginBottom: '4px' }}>Version Code</label>
                <input
                  type="number"
                  value={versionCodeInput}
                  onChange={(e) => setVersionCodeInput(Number(e.target.value) || 1)}
                  style={{ width: '100%', background: '#09090b', border: '1px solid #27272a', color: '#fff', padding: '8px 12px', borderRadius: '6px', fontSize: '13px' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowReviewModal(false)}
                style={{ background: '#27272a', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}
              >
                Cancel
              </button>
              <button
                onClick={handleStartBuild}
                style={{ background: '#22c55e', border: 'none', color: '#000', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
              >
                Start Build
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
