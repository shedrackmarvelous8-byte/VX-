import { useState, useEffect } from 'react'
import { Icon } from '../ui/Icon'
import { authFetch } from '../../lib/api'
import type { BuildResult } from '@/lib/sandbox/types'
import { AndroidBuildSection } from './AndroidBuildSection'

interface BuildSurfaceProps {
  projectId: string
  projectName?: string
}

export function BuildSurface({ projectId, projectName }: BuildSurfaceProps) {
  const [isBuilding, setIsBuilding] = useState(false)
  const [result, setResult] = useState<BuildResult | null>(null)
  const [showRawOutput, setShowRawOutput] = useState(false)
  const [projectTarget, setProjectTarget] = useState<'web' | 'mobile' | 'web_mobile'>('web')

  useEffect(() => {
    let isMounted = true
    async function loadProjectInfo() {
      try {
        const res = await authFetch(`/api/projects/${projectId}`)
        if (res.ok && isMounted) {
          const data = await res.json()
          if (data.project?.target) {
            setProjectTarget(data.project.target)
          }
        }
      } catch {
        // Ignore
      }
    }
    loadProjectInfo()
    return () => {
      isMounted = false
    }
  }, [projectId])

  const handleBuild = async () => {
    setIsBuilding(true)
    try {
      const res = await authFetch('/api/sandbox/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      const data = await res.json()
      if (data.result) {
        setResult(data.result)
      }
    } catch {
      // Handled by state
    } finally {
      setIsBuilding(false)
    }
  }

  return (
    <div className="build-container">
      {/* Android APK Build Section for Mobile / Web + Mobile Projects */}
      {(projectTarget === 'mobile' || projectTarget === 'web_mobile') && (
        <AndroidBuildSection projectId={projectId} projectName={projectName} />
      )}

      <div className="build-card" style={{ marginTop: projectTarget !== 'web' ? '16px' : '0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '15px', color: 'var(--text)' }}>
              Project Build & Diagnostics
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              Compiles {projectName || 'project'} in the sandbox, runs TypeScript checks, and bundles assets.
            </p>
          </div>
          <button
            className="surface-tab is-active"
            onClick={handleBuild}
            disabled={isBuilding}
            style={{ padding: '6px 14px', background: '#238636', color: '#fff', borderColor: '#2ea043' }}
          >
            <Icon name="sparkle" size={14} />
            {isBuilding ? 'Building...' : 'Run Build'}
          </button>
        </div>

        {result && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
            <span className={`status-pill status-pill--${result.success ? 'running' : 'error'}`}>
              <span className="status-dot" />
              {result.success ? 'Build Succeeded' : 'Build Failed'}
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Duration: {result.duration}ms
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Exit code: {result.exitCode ?? 'none'}
            </span>
            {result.errors.length > 0 && (
              <span style={{ fontSize: '12px', color: '#f87171' }}>
                {result.errors.length} {result.errors.length === 1 ? 'error' : 'errors'} found
              </span>
            )}
          </div>
        )}
      </div>

      {result && result.errors.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <h4 style={{ margin: '8px 0 4px 0', fontSize: '13px', color: '#f87171' }}>
            Diagnostic Errors ({result.errors.length})
          </h4>
          {result.errors.map((err, idx) => (
            <div key={idx} className="build-error-item">
              <div className="build-error-header">
                <span>{err.file || 'General Build Error'}</span>
                {err.line ? <span>Line {err.line}:{err.column || 0}</span> : null}
              </div>
              <div style={{ color: 'var(--text)', fontSize: '12px' }}>{err.message}</div>
              {err.codeFrame && (
                <pre className="build-error-codeframe">{err.codeFrame}</pre>
              )}
            </div>
          ))}
        </div>
      )}

      {result && (
        <div className="build-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '13px', fontWeight: 600 }}>Raw Compiler Output</span>
            <button
              className="surface-tab"
              onClick={() => setShowRawOutput((o) => !o)}
              style={{ padding: '2px 8px', fontSize: '11px' }}
            >
              {showRawOutput ? 'Hide Output' : 'View Output'}
            </button>
          </div>
          {showRawOutput && (
            <pre style={{
              background: '#0d1117',
              color: '#c9d1d9',
              padding: '12px',
              borderRadius: '6px',
              fontFamily: 'monospace',
              fontSize: '11px',
              whiteSpace: 'pre-wrap',
              maxHeight: '320px',
              overflowY: 'auto',
            }}>
              {result.stdout || result.stderr || 'No stdout or stderr output generated.'}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
