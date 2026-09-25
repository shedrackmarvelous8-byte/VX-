import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Conversation, ConversationAction, Project } from '../../types/chat'
import { Icon } from '../ui/Icon'
import { ConversationMenu } from './ConversationMenu'

interface RecentListProps {
  items: Conversation[]
  projects: Project[]
  activeId: string | null
  onSelect: (id: string) => void
  onRename: (id: string, title: string) => void
  onAction: (id: string, action: ConversationAction, projectId?: string) => void
}

export function RecentList({ items, projects, activeId, onSelect, onRename, onAction }: RecentListProps) {
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)

  if (!items.length) return <p className="recent-empty">No conversations yet</p>

  return (
    <ul className="recent-list">
      {items.map((c) => (
        <RecentItem
          key={c.id}
          convo={c}
          projects={projects}
          active={c.id === activeId}
          menuOpen={menuFor === c.id}
          editing={editing === c.id}
          onSelect={() => onSelect(c.id)}
          onOpenMenu={() => setMenuFor((m) => (m === c.id ? null : c.id))}
          onCloseMenu={() => setMenuFor((m) => (m === c.id ? null : m))}
          onAction={(a, pid) => (a === 'rename' ? setEditing(c.id) : onAction(c.id, a, pid))}
          onRenameDone={(title) => {
            setEditing(null)
            if (title !== null && title.trim() && title.trim() !== c.title) onRename(c.id, title.trim())
          }}
        />
      ))}
    </ul>
  )
}

interface RecentItemProps {
  convo: Conversation
  projects: Project[]
  active: boolean
  menuOpen: boolean
  editing: boolean
  onSelect: () => void
  onOpenMenu: () => void
  onCloseMenu: () => void
  onAction: (a: ConversationAction, projectId?: string) => void
  onRenameDone: (title: string | null) => void
}

function RecentItem(props: RecentItemProps) {
  const { convo, projects, active, menuOpen, editing, onSelect, onOpenMenu, onCloseMenu, onAction, onRenameDone } = props
  const dotsRef = useRef<HTMLButtonElement>(null)

  return (
    <li
      className="recent-item"
      data-active={active || undefined}
      data-menu-open={menuOpen || undefined}
      data-editing={editing || undefined}
    >
      {editing ? (
        <RenameField initial={convo.title} onDone={onRenameDone} />
      ) : (
        <>
          <button
            type="button"
            className="recent-item__main"
            aria-current={active ? 'page' : undefined}
            onClick={onSelect}
          >
            {convo.pinned && <Icon name="pin" size={14} className="recent-item__pin" aria-label="Pinned" />}
            <span className="recent-item__title">{convo.title}</span>
          </button>
          <button
            ref={dotsRef}
            type="button"
            className="recent-item__dots"
            aria-label={`More options for ${convo.title}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={onOpenMenu}
          >
            <span className="recent-item__dots-visual"><Icon name="more" size={18} /></span>
          </button>
          <ConversationMenu
            open={menuOpen}
            anchorRef={dotsRef}
            conversation={convo}
            projects={projects}
            onClose={onCloseMenu}
            onAction={onAction}
          />
        </>
      )}
    </li>
  )
}

function RenameField({ initial, onDone }: { initial: string; onDone: (v: string | null) => void }) {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)
  const done = useRef(false)
  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])

  const finish = (v: string | null) => {
    if (done.current) return
    done.current = true
    onDone(v)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(value) }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(null) }
  }
  return (
    <input
      ref={ref}
      className="recent-item__input"
      aria-label="Conversation name"
      value={value}
      maxLength={80}
      enterKeyHint="done"
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => finish(value)}
    />
  )
}
