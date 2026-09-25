import { useState } from 'react'
import { Icon } from '../ui/Icon'
import { TerminalSurface } from './TerminalSurface'
import { PreviewSurface } from './PreviewSurface'
import { BuildSurface } from './BuildSurface'
import { DatabaseSurface } from '../database/DatabaseSurface'
import { EnvironmentSurface } from '../environment/EnvironmentSurface'
import { GitHubDeploySurface } from '../deploy/GitHubDeploySurface'
import { IntelligenceSurface } from '../intelligence/IntelligenceSurface'
import type { Surface } from '../../types/chat'
import './sandbox.css'

interface SurfaceManagerProps {
  surface: Surface | null
  onClose: () => void
  projectId: string
  projectName?: string
  onSelectSurface?: (s: Surface) => void
}

type TabType = 'preview' | 'terminal' | 'build' | 'database' | 'environment' | 'github' | 'intelligence'

export function SurfaceManager({
  surface,
  onClose,
  projectId,
  projectName,
  onSelectSurface,
}: SurfaceManagerProps) {
  const [overrideTab, setOverrideTab] = useState<TabType | null>(null)

  const activeTab: TabType =
    overrideTab ??
    (surface === 'terminal'
      ? 'terminal'
      : surface === 'code'
      ? 'build'
      : surface === 'database'
      ? 'database'
      : surface === 'environment'
      ? 'environment'
      : surface === 'github'
      ? 'github'
      : 'preview')

  if (!surface) return null

  const handleTabClick = (tab: TabType) => {
    setOverrideTab(tab)
    if (tab === 'preview') onSelectSurface?.('preview')
    if (tab === 'terminal') onSelectSurface?.('terminal')
    if (tab === 'build') onSelectSurface?.('code')
    if (tab === 'database') onSelectSurface?.('database')
    if (tab === 'environment') onSelectSurface?.('environment')
    if (tab === 'github') onSelectSurface?.('github')
  }

  return (
    <aside className="surface-panel" aria-label="Development Workspace Surface">
      {/* Surface Header */}
      <div className="surface-header">
        <div className="surface-tabs" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <button
            className={`surface-tab ${activeTab === 'preview' ? 'is-active' : ''}`}
            onClick={() => handleTabClick('preview')}
          >
            <Icon name="preview" size={15} />
            Preview
          </button>
          <button
            className={`surface-tab ${activeTab === 'terminal' ? 'is-active' : ''}`}
            onClick={() => handleTabClick('terminal')}
          >
            <Icon name="terminal" size={15} />
            Terminal
          </button>
          <button
            className={`surface-tab ${activeTab === 'build' ? 'is-active' : ''}`}
            onClick={() => handleTabClick('build')}
          >
            <Icon name="code" size={15} />
            Build
          </button>
          <button
            className={`surface-tab ${activeTab === 'database' ? 'is-active' : ''}`}
            onClick={() => handleTabClick('database')}
          >
            <Icon name="database" size={15} />
            Database
          </button>
          <button
            className={`surface-tab ${activeTab === 'environment' ? 'is-active' : ''}`}
            onClick={() => handleTabClick('environment')}
          >
            <Icon name="environment" size={15} />
            Environment
          </button>
          <button
            className={`surface-tab ${activeTab === 'github' ? 'is-active' : ''}`}
            onClick={() => handleTabClick('github')}
          >
            <Icon name="github" size={15} />
            GitHub
          </button>
          <button
            className={`surface-tab ${activeTab === 'intelligence' ? 'is-active' : ''}`}
            onClick={() => handleTabClick('intelligence')}
          >
            <Icon name="sparkle" size={15} />
            Work Intel
          </button>
        </div>

        <div className="surface-actions">
          <button
            className="surface-tab"
            onClick={onClose}
            title="Close Panel"
            style={{ padding: '4px 8px', borderRadius: '50%' }}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      </div>

      {/* Surface Body */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {activeTab === 'preview' && (
          <PreviewSurface projectId={projectId} projectName={projectName} />
        )}
        {activeTab === 'terminal' && (
          <TerminalSurface projectId={projectId} projectName={projectName} />
        )}
        {activeTab === 'build' && (
          <BuildSurface projectId={projectId} projectName={projectName} />
        )}
        {activeTab === 'database' && (
          <DatabaseSurface projectId={projectId} projectName={projectName} />
        )}
        {activeTab === 'environment' && (
          <EnvironmentSurface projectId={projectId} projectName={projectName} />
        )}
        {activeTab === 'github' && (
          <GitHubDeploySurface projectId={projectId} projectName={projectName} />
        )}
        {activeTab === 'intelligence' && (
          <IntelligenceSurface projectId={projectId} projectName={projectName} />
        )}
      </div>
    </aside>
  )
}
