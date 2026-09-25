'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Composer, type ComposerHandle } from '../components/composer/Composer'
import { EmptyState } from '../components/chat/EmptyState'
import { MessageList } from '../components/chat/MessageList'
import { ScrollToBottom } from '../components/chat/ScrollToBottom'
import { Header } from '../components/header/Header'
import { AppShell } from '../components/layout/AppShell'
import { ModelSheet } from '../components/models/ModelSheet'
import { Sidebar } from '../components/sidebar/Sidebar'
import { surfaceLabel } from '../components/sidebar/navigation'
import { SurfaceManager } from '../components/sandbox/SurfaceManager'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { useToast } from '../components/ui/Toast'
import { AuthSheet, type AuthMode } from '../components/auth/AuthSheet'
import { AccountSheet } from '../components/auth/AccountSheet'
import { NewProjectDialog } from '../components/projects/NewProjectDialog'
import { defaultModelId, fileCounts, models } from '../data/placeholder'
import type { Surface } from '../types/chat'
import { useConversationActions } from './useConversationActions'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useViewportHeight } from '../hooks/useViewportHeight'
import { useWorkspace } from '../hooks/useWorkspace'
import { useAuth } from '../hooks/useAuth'

export function App() {
  useViewportHeight()
  const { user, isAuthenticated } = useAuth()
  const ws = useWorkspace()
  const toast = useToast()
  const actions = useConversationActions(ws)
  const docked = useMediaQuery('(min-width: 1024px)')
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const sidebarOpen = docked || mobileSidebarOpen

  const [scrolled, setScrolled] = useState(false)
  const [awayFromBottom, setAwayFromBottom] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const [availableModels, setAvailableModels] = useState<typeof models>([])
  const [modelId, setModelId] = useState('auto')
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [accountOpen, setAccountOpen] = useState(false)
  const [newProjectOpen, setNewProjectOpen] = useState(false)

  // Stable ref for setModel to prevent stale closures
  const wsSetModelRef = useRef(ws.setModel)
  useEffect(() => {
    wsSetModelRef.current = ws.setModel
  }, [ws.setModel])

  // Initial load of model catalog without synchronous setState in effect
  useEffect(() => {
    let ignore = false
    async function loadModels() {
      try {
        const res = await fetch('/api/models')
        if (!res.ok) throw new Error(`Failed to load dynamic model catalog (${res.status})`)
        const data = await res.json()
        if (!ignore && data?.models && Array.isArray(data.models)) {
          setAvailableModels(data.models)
          if (data.defaultModelId) {
            setModelId((prev) => {
              if (!prev || prev === 'default' || prev === 'auto') {
                wsSetModelRef.current?.(data.defaultModelId)
                return data.defaultModelId
              }
              return prev
            })
          }
        }
      } catch (err: unknown) {
        if (!ignore) {
          const error = err as Error
          console.warn('Dynamic model fetch warning:', error.message)
          setModelsError(error.message)
        }
      }
    }
    loadModels()
    return () => {
      ignore = true
    }
  }, [])

  // Manual refresh of dynamic models triggered from UI
  const handleRefreshModels = useCallback(async () => {
    setModelsLoading(true)
    setModelsError(null)
    try {
      const res = await fetch('/api/models?refresh=true', { method: 'POST' })
      if (!res.ok) {
        throw new Error(`Failed to load dynamic model catalog (${res.status})`)
      }
      const data = await res.json()
      if (data?.models && Array.isArray(data.models)) {
        setAvailableModels(data.models)
        if (data.defaultModelId) {
          setModelId((prev) => {
            if (!prev || prev === 'default' || prev === 'auto') {
              wsSetModelRef.current?.(data.defaultModelId)
              return data.defaultModelId
            }
            return prev
          })
        }
      }
    } catch (err: unknown) {
      const error = err as Error
      console.warn('Dynamic model fetch warning:', error.message)
      setModelsError(error.message)
    } finally {
      setModelsLoading(false)
    }
  }, [])

  const handleSelectModel = (id: string) => {
    setModelId(id)
    ws.setModel(id)
    const selected = availableModels.find((m) => m.id === id)
    if (selected) {
      toast({ message: `Model set to ${selected.name}` })
    }
  }

  const currentSelectedModel = availableModels.find((m) => m.id === modelId)

  const threadRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<ComposerHandle>(null)

  const messages = ws.active?.messages ?? []

  const scrollToBottom = useCallback((smooth = true) => {
    const el = threadRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  // Jump to latest when switching conversation or when a new message is appended
  useLayoutEffect(() => { scrollToBottom(false) }, [ws.active?.id, scrollToBottom])
  useEffect(() => { scrollToBottom(true) }, [messages.length, scrollToBottom])

  const onScroll = () => {
    const el = threadRef.current
    if (!el) return
    setScrolled(el.scrollTop > 4)
    setAwayFromBottom(el.scrollHeight - el.scrollTop - el.clientHeight > 160)
  }

  const closeSidebar = useCallback(() => setMobileSidebarOpen(false), [])

  // Surfaces are contextual panels that open beside the chat
  const { setSurface } = ws
  const openSurface = useCallback(
    (s: Surface) => {
      setSurface(s)
      if (
        s !== 'preview' &&
        s !== 'terminal' &&
        s !== 'code' &&
        s !== 'database' &&
        s !== 'environment' &&
        s !== 'github'
      ) {
        toast({ message: `${surfaceLabel(s)} opens here in a later step` })
      }
    },
    [setSurface, toast],
  )

  const handleOpenAccount = () => {
    if (isAuthenticated) {
      setAccountOpen(true)
    } else {
      setAuthMode('login')
      setAuthOpen(true)
    }
  }

  const handleOpenVerification = () => {
    setAccountOpen(false)
    setAuthMode('verify')
    setAuthOpen(true)
  }

  const handleCreateProject = async (name: string, stack: string, description?: string) => {
    const res = await ws.createProject(name, stack, description)
    if (res.success) {
      toast({ message: `Project "${name}" created` })
    } else if (res.error) {
      toast({ message: res.error })
    }
    return res
  }

  return (
    <AppShell
      aside={
        ws.surface ? (
          <SurfaceManager
            surface={ws.surface}
            onClose={() => ws.setSurface(null)}
            projectId={ws.project?.id || 'proj-default'}
            projectName={ws.project?.name || 'Workspace'}
            onSelectSurface={ws.setSurface}
          />
        ) : undefined
      }
      sidebar={
        <Sidebar
          open={sidebarOpen}
          docked={docked}
          user={user}
          project={ws.project}
          projects={ws.projects}
          fileCount={fileCounts[ws.project?.id] || 0}
          recents={ws.recents}
          activeId={ws.active?.id ?? null}
          surface={ws.surface}
          onClose={closeSidebar}
          onNew={() => { ws.newConversation(); requestAnimationFrame(() => composerRef.current?.focus()) }}
          onSearch={() => toast({ message: 'Search comes in a later step' })}
          onSelect={ws.selectConversation}
          onSelectProject={ws.selectProject}
          onNewProject={() => setNewProjectOpen(true)}
          onOpenAccount={handleOpenAccount}
          onOpenSurface={openSurface}
          onRename={ws.renameConversation}
          onConversationAction={actions.onAction}
        />
      }
    >
      <Header
        projectName={ws.project?.name || 'Workspace'}
        modelName={currentSelectedModel?.name}
        hideMenu={docked && sidebarOpen}
        sidebarOpen={sidebarOpen}
        scrolled={scrolled}
        user={user}
        onToggleSidebar={() => setMobileSidebarOpen((o) => !o)}
        onOpenProject={() => setNewProjectOpen(true)}
        onOpenModel={() => setModelOpen(true)}
        onOpenAuth={(mode) => {
          setAuthMode(mode || 'login')
          setAuthOpen(true)
        }}
        onOpenAccount={() => setAccountOpen(true)}
      />
      <MessageList
        ref={threadRef}
        messages={messages}
        isStreaming={ws.isStreaming}
        onScroll={onScroll}
        onOpenPreview={() => openSurface('preview')}
        empty={<EmptyState projectName={ws.project?.name || 'Workspace'} onPick={(t) => composerRef.current?.setText(t)} />}
      />
      <div style={{ position: 'relative' }}>
        <ScrollToBottom visible={awayFromBottom && messages.length > 0} onClick={() => scrollToBottom()} />
        <Composer
          ref={composerRef}
          conversationId={ws.active?.id}
          mode={ws.mode}
          onModeChange={ws.setMode}
          onSend={ws.send}
          onVoiceTurnComplete={ws.appendVoiceTurn}
        />
      </div>
      <ConfirmDialog
        open={!!actions.pendingDelete}
        title="Delete conversation?"
        confirmLabel="Delete"
        danger
        onConfirm={actions.confirmDelete}
        onCancel={actions.cancelDelete}
      >
        This will delete <strong>{actions.pendingDelete?.title}</strong>.
      </ConfirmDialog>
      <ModelSheet
        open={modelOpen}
        onClose={() => setModelOpen(false)}
        models={availableModels}
        selectedId={modelId}
        onSelect={handleSelectModel}
        onRefresh={handleRefreshModels}
        isLoading={modelsLoading}
        error={modelsError}
      />
      <AuthSheet
        open={authOpen}
        initialMode={authMode}
        onClose={() => setAuthOpen(false)}
        onSuccess={() => toast({ message: 'Welcome to VX' })}
      />
      <AccountSheet
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        onOpenVerification={handleOpenVerification}
      />
      <NewProjectDialog
        open={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
        onCreate={handleCreateProject}
      />
    </AppShell>
  )
}
