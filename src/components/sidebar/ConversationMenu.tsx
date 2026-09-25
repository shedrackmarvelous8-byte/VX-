import { useEffect, useState, type RefObject } from 'react'
import type { Conversation, ConversationAction, Project } from '../../types/chat'
import { Menu, MenuHeader, MenuItem, MenuSeparator } from '../ui/Menu'
import { Icon } from '../ui/Icon'

interface ConversationMenuProps {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  conversation: Conversation
  projects: Project[]
  onClose: () => void
  onAction: (action: ConversationAction, projectId?: string) => void
}

type View = 'root' | 'add-to-project' | 'move'

/** Three-dot menu for a recent conversation. Sub-views for project selection stay inside the same popover. */
export function ConversationMenu({ open, anchorRef, conversation, projects, onClose, onAction }: ConversationMenuProps) {
  const [view, setView] = useState<View>('root')
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setView('root')
  }

  const run = (a: ConversationAction, projectId?: string) => { onClose(); onAction(a, projectId) }
  const chevron = <Icon name="chevronRight" size={16} />

  return (
    <Menu open={open} anchorRef={anchorRef} onClose={onClose} label={`Options for ${conversation.title}`}>
      {view === 'root' && (
        <>
          <MenuItem icon="share" label="Share" onSelect={() => run('share')} />
          <MenuItem icon="pencil" label="Rename" onSelect={() => run('rename')} />
          <MenuItem icon="pin" label={conversation.pinned ? 'Unpin' : 'Pin'} onSelect={() => run('pin')} />
          <MenuSeparator />
          <MenuItem icon="folderPlus" label="Add to project" trailing={chevron} onSelect={() => setView('add-to-project')} />
          <MenuItem icon="move" label="Move" trailing={chevron} onSelect={() => setView('move')} />
          <MenuItem icon="archive" label="Archive" onSelect={() => run('archive')} />
          <MenuSeparator />
          <MenuItem icon="trash" label="Delete" danger onSelect={() => run('delete')} />
        </>
      )}

      {view === 'add-to-project' && (
        <>
          <MenuHeader title="Add to project" onBack={() => setView('root')} />
          {projects.map((p) => (
            <MenuItem
              key={p.id}
              icon="folder"
              label={p.name}
              checked={p.id === conversation.projectId}
              onSelect={() => run('add-to-project', p.id)}
            />
          ))}
          <MenuSeparator />
          <MenuItem icon="plus" label="New project" onSelect={() => run('add-to-project', '__new__')} />
        </>
      )}

      {view === 'move' && (
        <>
          <MenuHeader title="Move to" onBack={() => setView('root')} />
          {projects.filter((p) => p.id !== conversation.projectId).map((p) => (
            <MenuItem key={p.id} icon="folder" label={p.name} hint={p.stack} onSelect={() => run('move', p.id)} />
          ))}
        </>
      )}
    </Menu>
  )
}
