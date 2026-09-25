import { useState, useEffect, useRef, useCallback } from 'react'
import { Icon } from '../ui/Icon'
import { authFetch } from '../../lib/api'
import type { DevServerState, DevServerStatus } from '@/lib/sandbox/types'

interface PreviewSurfaceProps {
  projectId: string
  projectName?: string
}

type ViewportSize = 'desktop' | 'tablet' | 'mobile'

export function PreviewSurface({ projectId, projectName }: PreviewSurfaceProps) {
  const [serverState, setServerState] = useState<DevServerState>({
    projectId,
    status: 'stopped',
    logs: [],
  })
  const [loading, setLoading] = useState(false)
  const [viewport, setViewport] = useState<ViewportSize>('desktop')
  const [logsOpen, setLogsOpen] = useState(false)
  const [iframeKey, setIframeKey] = useState(0)
  const [projectTarget, setProjectTarget] = useState<'web' | 'mobile' | 'web_mobile'>('web')

  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    let isMounted = true

    async function loadProjectInfo() {
      try {
        const res = await authFetch(`/api/projects/${projectId}`)
        if (res.ok && isMounted) {
          const data = await res.json()
          if (data.project?.target) {
            setProjectTarget(data.project.target)
            if (data.project.target === 'mobile') {
              setViewport('mobile')
            }
          }
        }
      } catch {
        // Ignore
      }
    }

    loadProjectInfo()

    const poll = async () => {
      try {
        const res = await authFetch(`/api/sandbox/dev-server?projectId=${encodeURIComponent(projectId)}`)
        if (res.ok && isMounted) {
          const data = await res.json()
          if (data.state && isMounted) {
            setServerState(data.state)
          }
        }
      } catch {
        // Ignore background poll errors
      }
    }

    poll()
    const timer = setInterval(poll, 3000)
    return () => {
      isMounted = false
      clearInterval(timer)
    }
  }, [projectId])

  const handleServerAction = async (action: 'start' | 'stop' | 'restart') => {
    setLoading(true)
    try {
      const res = await authFetch('/api/sandbox/dev-server', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, action }),
      })
      const data = await res.json()
      if (data.state) {
        setServerState(data.state)
        setIframeKey((k) => k + 1)
      }
    } catch {
      // Handled by state
    } finally {
      setLoading(false)
    }
  }

  const handleReload = () => {
    setIframeKey((k) => k + 1)
  }

  const previewUrl = `/api/sandbox/preview/${projectId}`

  const getViewportWidth = () => {
    if (viewport === 'mobile') return '375px'
    if (viewport === 'tablet') return '768px'
    return '100%'
  }

  const statusLabel = {
    stopped: 'Stopped',
    starting: 'Starting...',
    running: 'Active',
    crashed: 'Crashed',
    error: 'Error',
  }[serverState.status]

  return (
    <div className="preview-container">
      {/* Top Controls Bar */}
      <div className="preview-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className={`status-pill status-pill--${serverState.status === 'running' ? 'running' : serverState.status === 'starting' ? 'starting' : 'stopped'}`}>
            <span className="status-dot" />
            {statusLabel}
          </span>
          {serverState.status === 'running' ? (
            <button
              className="surface-tab"
              onClick={() => handleServerAction('restart')}
              disabled={loading}
              title="Restart Dev Server"
              style={{ padding: '2px 8px', fontSize: '11px' }}
            >
              <Icon name="refresh" size={13} />
              Restart
            </button>
          ) : (
            <button
              className="surface-tab"
              onClick={() => handleServerAction('start')}
              disabled={loading}
              title="Start Dev Server"
              style={{ padding: '2px 8px', fontSize: '11px', color: '#4ade80' }}
            >
              <Icon name="play" size={13} />
              Start Server
            </button>
          )}
          {serverState.status === 'running' && (
            <button
              className="surface-tab"
              onClick={() => handleServerAction('stop')}
              disabled={loading}
              title="Stop Dev Server"
              style={{ padding: '2px 8px', fontSize: '11px', color: '#f87171' }}
            >
              <Icon name="stop" size={13} />
              Stop
            </button>
          )}
        </div>

        {/* Viewport switchers */}
        <div className="preview-viewport-toggle">
          <button
            className={`preview-viewport-btn ${viewport === 'desktop' ? 'is-active' : ''}`}
            onClick={() => setViewport('desktop')}
            title="Desktop view (100%)"
          >
            <Icon name="desktop" size={14} />
          </button>
          <button
            className={`preview-viewport-btn ${viewport === 'tablet' ? 'is-active' : ''}`}
            onClick={() => setViewport('tablet')}
            title="Tablet view (768px)"
          >
            <Icon name="tablet" size={14} />
          </button>
          <button
            className={`preview-viewport-btn ${viewport === 'mobile' ? 'is-active' : ''}`}
            onClick={() => setViewport('mobile')}
            title="Mobile view (375px)"
          >
            <Icon name="smartphone" size={14} />
          </button>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            className="surface-tab"
            onClick={handleReload}
            title="Reload Preview"
            style={{ padding: '4px 8px' }}
          >
            <Icon name="refresh" size={14} />
          </button>
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="surface-tab"
            title="Open in new window"
            style={{ padding: '4px 8px', textDecoration: 'none' }}
          >
            <Icon name="externalLink" size={14} />
          </a>
          <button
            className={`surface-tab ${logsOpen ? 'is-active' : ''}`}
            onClick={() => setLogsOpen((o) => !o)}
            title="Toggle Console Logs"
            style={{ padding: '4px 8px', fontSize: '11px' }}
          >
            Logs
          </button>
        </div>
      </div>

      {/* Frame wrapper */}
      <div className="preview-frame-wrapper" style={{ flexDirection: 'column', position: 'relative' }}>
        {projectTarget === 'mobile' && (
          <div style={{
            background: '#1c1917',
            borderBottom: '1px solid #78350f',
            color: '#fef3c7',
            padding: '8px 16px',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexShrink: 0,
            zIndex: 10,
          }}>
            <Icon name="smartphone" size={14} />
            <span>
              <strong>Expo / React Native Mobile Project:</strong> Native device preview requires a compatible Expo runtime. Use the Expo development workflow, QR code, or build validation instructions.
            </span>
          </div>
        )}
        <iframe
          key={iframeKey}
          ref={iframeRef}
          src={previewUrl}
          title={`${projectName || 'Project'} Preview`}
          className="preview-iframe"
          style={{ width: getViewportWidth(), flex: 1 }}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      </div>

      {/* Server logs drawer */}
      {logsOpen && (
        <div className="preview-logs-drawer">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontWeight: 600, color: '#c9d1d9' }}>Server Logs</span>
            <span style={{ fontSize: '10px' }}>{serverState.logs.length} lines</span>
          </div>
          {serverState.logs.length === 0 ? (
            <div style={{ fontStyle: 'italic' }}>No server logs recorded yet.</div>
          ) : (
            serverState.logs.slice(-50).map((line, idx) => (
              <div key={idx} className="preview-log-line">
                {line}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
