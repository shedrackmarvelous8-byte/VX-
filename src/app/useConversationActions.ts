import { useCallback, useState } from 'react'
import type { ConversationAction, Conversation } from '../types/chat'
import type { Workspace } from '../hooks/useWorkspace'
import { useToast } from '../components/ui/Toast'

/**
 * Maps contextual-menu actions to local UI state + quiet feedback.
 * No backend: Share only copies a placeholder link; everything else is in-memory.
 */
export function useConversationActions(ws: Workspace) {
  const toast = useToast()
  const [pendingDelete, setPendingDelete] = useState<Conversation | null>(null)

  const onAction = useCallback(
    (id: string, action: ConversationAction, projectId?: string) => {
      const convo = ws.getConversation(id)
      if (!convo) return
      const projectName = (pid?: string) => ws.projects.find((p) => p.id === pid)?.name ?? 'project'
      switch (action) {
        case 'share': {
          const url = `${location.origin}/share/${id}`
          navigator.clipboard?.writeText(url).catch(() => {})
          toast({ message: 'Share link copied' })
          break
        }
        case 'pin':
          ws.togglePin(id)
          toast({ message: convo.pinned ? 'Unpinned' : 'Pinned to top' })
          break
        case 'add-to-project':
        case 'move': {
          if (projectId === '__new__') { toast({ message: 'Creating projects comes in a later step' }); break }
          if (!projectId || projectId === convo.projectId) break
          const from = convo.projectId
          ws.moveConversation(id, projectId)
          toast({
            message: `Moved to ${projectName(projectId)}`,
            action: { label: 'Undo', onClick: () => ws.moveConversation(id, from) },
          })
          break
        }
        case 'archive':
          ws.setArchived(id, true)
          toast({ message: 'Conversation archived', action: { label: 'Undo', onClick: () => ws.setArchived(id, false) } })
          break
        case 'delete':
          setPendingDelete(convo)
          break
        case 'rename':
          break // handled inline in RecentList
      }
    },
    [ws, toast],
  )

  const confirmDelete = useCallback(() => {
    const convo = pendingDelete
    if (!convo) return
    setPendingDelete(null)
    ws.deleteConversation(convo.id)
    toast({ message: 'Conversation deleted', action: { label: 'Undo', onClick: () => ws.restoreConversation(convo) } })
  }, [pendingDelete, ws, toast])

  return { onAction, pendingDelete, confirmDelete, cancelDelete: () => setPendingDelete(null) }
}
