import type { AuthUser } from '../../hooks/useAuth'
import { useEffect, useRef, useState } from 'react'
import type { Conversation, ConversationAction, Project, Surface } from '../../types/chat'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { NavItem } from './NavItem'
import { ProjectList } from './ProjectList'
import { RecentList } from './RecentList'
import { SidebarSection } from './SidebarSection'
import { devNav } from './navigation'
import { useSwipeToClose } from './useSwipeToClose'
import './Sidebar.css'

interface SidebarProps {
  open: boolean
  docked: boolean
  user?: AuthUser | null
  project: Project
  projects: Project[]
  fileCount?: number
  recents: Conversation[]
  activeId: string | null
  surface: Surface | null
  onClose: () => void
  onNew: () => void
  onSearch?: () => void
  onSelect: (id: string) => void
  onSelectProject: (id: string) => void
  onNewProject?: () => void
  onOpenAccount?: () => void
  onOpenSurface: (s: Surface) => void
  onRename: (id: string, title: string) => void
  onConversationAction: (id: string, action: ConversationAction, projectId?: string) => void
}

/**
 * Navigation drawer (mobile/tablet) / docked panel (≥1024px).
 * Structure: New chat → Projects (+ Files) → Development → Recents → Account.
 * Selecting a surface never replaces the conversation; it only reports intent upward.
 */
export function Sidebar(props: SidebarProps) {
  const {
    open, docked, user, project, projects, fileCount, recents, activeId, surface,
    onClose, onNew, onSearch, onSelect, onSelectProject, onNewProject, onOpenAccount, onOpenSurface, onRename, onConversationAction,
  } = props
  const panelRef = useRef<HTMLElement>(null)
  const [scrolled, setScrolled] = useState(false)

  useSwipeToClose(panelRef, !docked && open, onClose)

  // Mobile drawer: Esc closes, focus moves into the panel, background doesn't scroll.
  useEffect(() => {
    if (docked || !open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.activeElement as HTMLElement | null
    panelRef.current?.querySelector<HTMLElement>('.sidebar__new')?.focus({ preventScroll: true })
    return () => {
      window.removeEventListener('keydown', onKey)
      prev?.focus?.({ preventScroll: true })
    }
  }, [open, docked, onClose])

  /** Run a navigation action; on overlay layouts, also dismiss the drawer. */
  const nav = (fn: () => void) => () => {
    fn()
    if (!docked) onClose()
  }

  const userInitial = (user?.display_name?.[0] || user?.email?.[0] || 'A').toUpperCase()
  const userLabel = user ? (user.display_name || user.email) : 'Sign In / Account'

  return (
    <>
      {!docked && (
        <div className="sidebar-scrim" data-open={open || undefined} onClick={onClose} aria-hidden="true" />
      )}
      <aside
        id="sidebar"
        ref={panelRef}
        className="sidebar"
        data-open={open || undefined}
        data-docked={docked || undefined}
        aria-hidden={!open}
        inert={!open}
        aria-label="VX navigation"
      >
        <div className="sidebar__top">
          <div className="sidebar__brand">
            <span className="sidebar__mark" aria-hidden="true">
              <Icon name="code" size={16} strokeWidth={2} />
            </span>
            <span>VX</span>
          </div>
          <IconButton icon={docked ? 'sidebar' : 'close'} label="Close sidebar" onClick={onClose} />
        </div>

        <div className="sidebar__primary" data-scrolled={scrolled || undefined}>
          <button type="button" className="sidebar__new" onClick={nav(onNew)}>
            <Icon name="newChat" size={19} />
            <span>New chat</span>
          </button>
          <IconButton icon="search" label="Search conversations" variant="surface" onClick={onSearch} />
        </div>

        <div className="sidebar__scroll" onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 2)}>
          <SidebarSection
            title="Projects"
            action={
              <IconButton icon="plus" label="New project" size="sm" className="sb-section__action" onClick={onNewProject} />
            }
          >
            <ProjectList projects={projects} activeId={project.id} onSelect={(id) => nav(() => onSelectProject(id))()} />
            <div className="sidebar__files">
              <NavItem
                icon="files"
                label="Files"
                active={surface === 'files'}
                trailing={fileCount != null ? fileCount : undefined}
                onClick={nav(() => onOpenSurface('files'))}
              />
            </div>
          </SidebarSection>

          <SidebarSection title="Development">
            <ul className="nav-list">
              {devNav.map((item) => (
                <li key={item.id}>
                  <NavItem
                    icon={item.icon}
                    label={item.label}
                    active={surface === item.id}
                    onClick={nav(() => onOpenSurface(item.id))}
                  />
                </li>
              ))}
            </ul>
          </SidebarSection>

          <SidebarSection title="Recents">
            <RecentList
              items={recents}
              projects={projects}
              activeId={activeId}
              onSelect={(id) => nav(() => onSelect(id))()}
              onRename={onRename}
              onAction={onConversationAction}
            />
          </SidebarSection>
        </div>

        <div className="sidebar__footer">
          <button type="button" className="sidebar__row" onClick={onOpenAccount}>
            <span className="sidebar__avatar" aria-hidden="true">{userInitial}</span>
            <span className="sidebar__ellipsis">{userLabel}</span>
            <Icon name="settings" size={18} className="sidebar__trail" />
          </button>
        </div>
      </aside>
    </>
  )
}
