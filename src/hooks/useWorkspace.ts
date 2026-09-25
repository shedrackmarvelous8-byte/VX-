import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import type { Attachment, Conversation, InputMode, Message, Project, Surface } from '../types/chat'
import { useAuth } from './useAuth'
import { authFetch } from '../lib/api'

interface State {
  projectId: string
  conversations: Conversation[]
  activeId: string | null
  mode: InputMode
  surface: Surface | null
  modelId: string
  isStreaming: boolean
}

type Action =
  | { type: 'set_projects_and_convos'; projectId: string; conversations: Conversation[] }
  | { type: 'set_conversations'; conversations: Conversation[] }
  | { type: 'set_messages'; conversationId: string; messages: Message[] }
  | { type: 'select'; id: string }
  | { type: 'new' }
  | { type: 'add_conversation'; convo: Conversation }
  | { type: 'append_message'; conversationId: string; message: Message }
  | { type: 'update_message_chunk'; conversationId: string; messageId: string; chunk: string }
  | { type: 'replace_message'; conversationId: string; tempId: string; message: Message }
  | { type: 'set_streaming'; isStreaming: boolean }
  | { type: 'set_model'; modelId: string }
  | { type: 'mode'; mode: InputMode }
  | { type: 'project'; id: string }
  | { type: 'surface'; surface: Surface | null }
  | { type: 'rename'; id: string; title: string }
  | { type: 'pin'; id: string }
  | { type: 'move'; id: string; projectId: string }
  | { type: 'archive'; id: string; archived: boolean }
  | { type: 'delete'; id: string }
  | { type: 'restore'; convo: Conversation }

const uid = () => Math.random().toString(36).slice(2, 10)

const patch = (list: Conversation[], id: string, fn: (c: Conversation) => Conversation) =>
  list.map((c) => (c.id === id ? fn(c) : c))

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'set_projects_and_convos':
      return {
        ...state,
        projectId: action.projectId,
        conversations: action.conversations,
        activeId: action.conversations.length > 0 ? action.conversations[0].id : null,
      }

    case 'set_conversations':
      return {
        ...state,
        conversations: action.conversations,
        activeId:
          state.activeId && action.conversations.some((c) => c.id === state.activeId)
            ? state.activeId
            : action.conversations[0]?.id ?? null,
      }

    case 'set_messages':
      return {
        ...state,
        conversations: patch(state.conversations, action.conversationId, (c) => ({
          ...c,
          messages: action.messages,
        })),
      }

    case 'select': {
      const convo = state.conversations.find((c) => c.id === action.id)
      return {
        ...state,
        activeId: action.id,
        projectId: convo?.projectId ?? state.projectId,
      }
    }

    case 'new':
      return { ...state, activeId: null }

    case 'add_conversation':
      return {
        ...state,
        conversations: [action.convo, ...state.conversations.filter((c) => c.id !== action.convo.id)],
        activeId: action.convo.id,
      }

    case 'append_message':
      return {
        ...state,
        conversations: patch(state.conversations, action.conversationId, (c) => {
          const exists = c.messages.some((m) => m.id === action.message.id)
          return {
            ...c,
            messages: exists ? c.messages : [...c.messages, action.message],
            updatedAt: action.message.createdAt,
          }
        }),
      }

    case 'update_message_chunk':
      return {
        ...state,
        conversations: patch(state.conversations, action.conversationId, (c) => ({
          ...c,
          messages: c.messages.map((m) =>
            m.id === action.messageId ? { ...m, content: m.content + action.chunk } : m
          ),
          updatedAt: Date.now(),
        })),
      }

    case 'replace_message':
      return {
        ...state,
        conversations: patch(state.conversations, action.conversationId, (c) => ({
          ...c,
          messages: c.messages.map((m) => (m.id === action.tempId ? action.message : m)),
          updatedAt: Date.now(),
        })),
      }

    case 'set_streaming':
      return { ...state, isStreaming: action.isStreaming }

    case 'set_model':
      return { ...state, modelId: action.modelId }

    case 'mode':
      return { ...state, mode: action.mode }

    case 'project':
      return { ...state, projectId: action.id, activeId: null }

    case 'surface':
      return { ...state, surface: action.surface }

    case 'rename':
      return {
        ...state,
        conversations: patch(state.conversations, action.id, (c) => ({
          ...c,
          title: action.title,
          updatedAt: Date.now(),
        })),
      }

    case 'pin':
      return {
        ...state,
        conversations: patch(state.conversations, action.id, (c) => ({
          ...c,
          pinned: !c.pinned,
          updatedAt: Date.now(),
        })),
      }

    case 'move':
      return {
        ...state,
        conversations: patch(state.conversations, action.id, (c) => ({
          ...c,
          projectId: action.projectId,
          updatedAt: Date.now(),
        })),
        projectId: state.activeId === action.id ? action.projectId : state.projectId,
      }

    case 'archive':
      return {
        ...state,
        conversations: patch(state.conversations, action.id, (c) => ({
          ...c,
          archived: action.archived,
        })),
        activeId: action.archived && state.activeId === action.id ? null : state.activeId,
      }

    case 'delete':
      return {
        ...state,
        conversations: state.conversations.filter((c) => c.id !== action.id),
        activeId: state.activeId === action.id ? null : state.activeId,
      }

    case 'restore':
      return {
        ...state,
        conversations: [action.convo, ...state.conversations.filter((c) => c.id !== action.convo.id)],
        activeId: action.convo.id,
      }
  }
}

export function useWorkspace() {
  const { user, isAuthenticated } = useAuth()
  const [projectsList, setProjectsList] = useState<Project[]>([])

  const [state, dispatch] = useReducer(reducer, {
    projectId: '',
    conversations: [],
    activeId: null,
    mode: 'text',
    surface: null,
    modelId: 'auto',
    isStreaming: false,
  })

  // 1. Initial Load: Fetch Projects & Conversations from Real Backend
  useEffect(() => {
    let isMounted = true

    async function loadInitialData() {
      if (!isAuthenticated) {
        const guestProject: Project = {
          id: 'guest-project-default',
          name: 'Workspace',
          stack: 'Next.js',
          updatedAt: Date.now(),
        }
        if (isMounted) {
          setProjectsList([guestProject])
          dispatch({
            type: 'set_projects_and_convos',
            projectId: guestProject.id,
            conversations: [],
          })
        }
        return
      }

      try {
        // Fetch Projects
        const projRes = await authFetch('/api/projects')
        let projs: Project[] = []
        if (projRes.ok) {
          const projData = await projRes.json()
          if (Array.isArray(projData.projects) && projData.projects.length > 0) {
            projs = projData.projects.map((p: { id: string; name: string; stack?: string; updated_at?: string }) => ({
              id: p.id,
              name: p.name,
              stack: p.stack || 'Next.js',
              updatedAt: p.updated_at ? new Date(p.updated_at).getTime() : Date.now(),
            }))
          }
        }

        // Fetch Conversations
        const convoRes = await authFetch('/api/conversations?includeArchived=true')
        let convos: Conversation[] = []
        if (convoRes.ok) {
          const convoData = await convoRes.json()
          if (Array.isArray(convoData.conversations)) {
            convos = convoData.conversations.map((c: {
              id: string
              project_id: string
              title: string
              pinned?: boolean
              archived?: boolean
              updated_at: string
            }) => ({
              id: c.id,
              projectId: c.project_id,
              title: c.title,
              pinned: Boolean(c.pinned),
              archived: Boolean(c.archived),
              messages: [],
              updatedAt: new Date(c.updated_at).getTime(),
            }))
          }
        }

        if (isMounted) {
          if (projs.length > 0) {
            setProjectsList(projs)
            dispatch({
              type: 'set_projects_and_convos',
              projectId: projs[0].id,
              conversations: convos,
            })
          }
        }
      } catch (err) {
        console.warn('Failed to load initial workspace data:', err)
      }
    }

    loadInitialData()

    return () => {
      isMounted = false
    }
  }, [isAuthenticated, user?.id])

  // 2. Fetch Messages for active conversation when activeId changes
  useEffect(() => {
    if (!state.activeId || !isAuthenticated) return
    const currentActiveId = state.activeId
    let ignore = false

    authFetch(`/api/conversations/${currentActiveId}/messages`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch messages')
        return res.json()
      })
      .then((data) => {
        if (!ignore && Array.isArray(data.messages)) {
          const mapped: Message[] = data.messages.map((m: {
            id: string
            role: 'user' | 'assistant' | 'system'
            content: string
            created_at: string
            metadata?: Record<string, unknown>
          }) => ({
            id: m.id,
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content,
            createdAt: new Date(m.created_at).getTime(),
            attachments: (m.metadata?.attachments as Attachment[]) || undefined,
            kind: (m.metadata?.kind as 'plan' | 'activity' | 'approval') || undefined,
          }))
          dispatch({
            type: 'set_messages',
            conversationId: currentActiveId,
            messages: mapped,
          })
        }
      })
      .catch((err) => {
        console.warn('Failed to load conversation messages:', err)
      })

    return () => {
      ignore = true
    }
  }, [state.activeId, isAuthenticated])

  // 3. Project CRUD Handlers
  const createProject = useCallback(
    async (name: string, stack = 'Next.js', description?: string) => {
      if (!isAuthenticated) {
        const newProj: Project = {
          id: `p-${Date.now()}`,
          name,
          stack,
          updatedAt: Date.now(),
        }
        setProjectsList((prev) => [newProj, ...prev])
        dispatch({ type: 'project', id: newProj.id })
        return { success: true }
      }

      try {
        const res = await authFetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, stack, description }),
        })
        const data = await res.json()
        if (!res.ok) {
          return { success: false, error: data.error || 'Failed to create project' }
        }
        const created: Project = {
          id: data.project.id,
          name: data.project.name,
          stack: data.project.stack || 'Next.js',
          updatedAt: new Date(data.project.updated_at).getTime(),
        }
        setProjectsList((prev) => [created, ...prev])
        dispatch({ type: 'project', id: created.id })
        return { success: true }
      } catch {
        return { success: false, error: 'Network error. Please try again.' }
      }
    },
    [isAuthenticated]
  )

  const renameProject = useCallback(
    async (projectId: string, newName: string) => {
      if (!isAuthenticated) {
        setProjectsList((prev) =>
          prev.map((p) => (p.id === projectId ? { ...p, name: newName, updatedAt: Date.now() } : p))
        )
        return { success: true }
      }

      try {
        const res = await authFetch(`/api/projects/${projectId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName }),
        })
        const data = await res.json()
        if (!res.ok) {
          return { success: false, error: data.error || 'Failed to rename project' }
        }
        setProjectsList((prev) =>
          prev.map((p) => (p.id === projectId ? { ...p, name: newName, updatedAt: Date.now() } : p))
        )
        return { success: true }
      } catch {
        return { success: false, error: 'Network error. Please try again.' }
      }
    },
    [isAuthenticated]
  )

  const deleteProject = useCallback(
    async (projectId: string) => {
      if (!isAuthenticated) {
        setProjectsList((prev) => prev.filter((p) => p.id !== projectId))
        return { success: true }
      }

      try {
        const res = await authFetch(`/api/projects/${projectId}`, {
          method: 'DELETE',
        })
        const data = await res.json()
        if (!res.ok) {
          return { success: false, error: data.error || 'Failed to delete project' }
        }
        setProjectsList((prev) => {
          const remaining = prev.filter((p) => p.id !== projectId)
          if (remaining.length > 0 && state.projectId === projectId) {
            dispatch({ type: 'project', id: remaining[0].id })
          }
          return remaining
        })
        return { success: true }
      } catch {
        return { success: false, error: 'Network error. Please try again.' }
      }
    },
    [isAuthenticated, state.projectId]
  )

  const newConversation = useCallback(async () => {
    dispatch({ type: 'new' })
  }, [])

  const selectConversation = useCallback((id: string) => {
    dispatch({ type: 'select', id })
  }, [])

  const renameConversation = useCallback(
    async (id: string, title: string) => {
      dispatch({ type: 'rename', id, title })

      if (isAuthenticated) {
        try {
          await authFetch(`/api/conversations/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title }),
          })
        } catch (err) {
          console.warn('Failed to rename conversation on server:', err)
        }
      }
    },
    [isAuthenticated]
  )

  const togglePin = useCallback(
    async (id: string) => {
      const convo = state.conversations.find((c) => c.id === id)
      if (!convo) return
      const nextPinned = !convo.pinned
      dispatch({ type: 'pin', id })

      if (isAuthenticated) {
        try {
          await authFetch(`/api/conversations/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pinned: nextPinned }),
          })
        } catch (err) {
          console.warn('Failed to pin/unpin conversation on server:', err)
        }
      }
    },
    [isAuthenticated, state.conversations]
  )

  const setArchived = useCallback(
    async (id: string, archived: boolean) => {
      dispatch({ type: 'archive', id, archived })

      if (isAuthenticated) {
        try {
          await authFetch(`/api/conversations/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ archived }),
          })
        } catch (err) {
          console.warn('Failed to archive/unarchive conversation on server:', err)
        }
      }
    },
    [isAuthenticated]
  )

  const moveConversation = useCallback(
    async (id: string, targetProjectId: string) => {
      dispatch({ type: 'move', id, projectId: targetProjectId })

      if (isAuthenticated) {
        try {
          await authFetch(`/api/conversations/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId: targetProjectId }),
          })
        } catch (err) {
          console.warn('Failed to move conversation on server:', err)
        }
      }
    },
    [isAuthenticated]
  )

  const deleteConversation = useCallback(
    async (id: string) => {
      dispatch({ type: 'delete', id })

      if (isAuthenticated) {
        try {
          await authFetch(`/api/conversations/${id}`, {
            method: 'DELETE',
          })
        } catch (err) {
          console.warn('Failed to delete conversation on server:', err)
        }
      }
    },
    [isAuthenticated]
  )

  const restoreConversation = useCallback(
    async (convo: Conversation) => {
      dispatch({ type: 'restore', convo })

      if (isAuthenticated) {
        try {
          await authFetch('/api/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId: convo.projectId,
              title: convo.title,
            }),
          })
        } catch (err) {
          console.warn('Failed to restore conversation on server:', err)
        }
      }
    },
    [isAuthenticated]
  )

  const setModel = useCallback((modelId: string) => {
    dispatch({ type: 'set_model', modelId })
  }, [])

  // 4. Send Message & Stream Real AI Response
  const send = useCallback(
    async (text: string, attachments: Attachment[] = []) => {
      const now = Date.now()
      const tempUserMsgId = uid()
      const tempAssistantMsgId = uid()

      const userMsg: Message = {
        id: tempUserMsgId,
        role: 'user',
        content: text,
        attachments: attachments.length ? attachments : undefined,
        createdAt: now,
      }

      let activeConvoId = state.activeId

      // If this is a brand new conversation
      if (!activeConvoId) {
        const title = text.split('\n')[0].slice(0, 60) || 'New chat'
        let newConvoId = uid()

        if (isAuthenticated) {
          try {
            const res = await authFetch('/api/conversations', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                projectId: state.projectId || projectsList[0]?.id,
                title,
              }),
            })
            if (res.ok) {
              const data = await res.json()
              if (data.conversation?.id) {
                newConvoId = data.conversation.id
              }
            }
          } catch (err) {
            console.warn('Failed to create new conversation on server:', err)
          }
        }

        const newConvo: Conversation = {
          id: newConvoId,
          projectId: state.projectId || projectsList[0]?.id || 'default',
          title,
          messages: [userMsg],
          updatedAt: now,
        }

        dispatch({ type: 'add_conversation', convo: newConvo })
        activeConvoId = newConvoId
      } else {
        dispatch({
          type: 'append_message',
          conversationId: activeConvoId,
          message: userMsg,
        })
      }

      if (!isAuthenticated) {
        // Unauthenticated demo fallback message
        const guestReply: Message = {
          id: tempAssistantMsgId,
          role: 'assistant',
          content: `To execute live AI generations across Gemini and OpenRouter models with full persistence, please sign in or create an account.`,
          createdAt: Date.now(),
        }
        dispatch({
          type: 'append_message',
          conversationId: activeConvoId,
          message: guestReply,
        })
        return
      }

      // Add streaming placeholder for assistant
      const assistantPlaceholder: Message = {
        id: tempAssistantMsgId,
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
      }

      dispatch({
        type: 'append_message',
        conversationId: activeConvoId,
        message: assistantPlaceholder,
      })
      dispatch({ type: 'set_streaming', isStreaming: true })

      try {
        const response = await authFetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId: activeConvoId,
            message: text,
            modelId: state.modelId,
            stream: true,
          }),
        })

        if (!response.ok) {
          const errData = await response.json().catch(() => null)
          throw new Error(errData?.error || `Server returned error ${response.status}`)
        }

        if (!response.body) {
          throw new Error('No streaming body received')
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder('utf-8')
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || !trimmed.startsWith('data:')) continue

            const jsonStr = trimmed.replace(/^data:\s*/, '')
            try {
              const parsed = JSON.parse(jsonStr)

              if (parsed.chunk) {
                dispatch({
                  type: 'update_message_chunk',
                  conversationId: activeConvoId,
                  messageId: tempAssistantMsgId,
                  chunk: parsed.chunk,
                })
              }

              if (parsed.done && parsed.message) {
                const finalMsg: Message = {
                  id: parsed.message.id,
                  role: 'assistant',
                  content: parsed.message.content,
                  createdAt: new Date(parsed.message.created_at).getTime(),
                }
                dispatch({
                  type: 'replace_message',
                  conversationId: activeConvoId,
                  tempId: tempAssistantMsgId,
                  message: finalMsg,
                })
              }

              if (parsed.error) {
                const errorMsg: Message = {
                  id: tempAssistantMsgId,
                  role: 'assistant',
                  content: `⚠️ ${parsed.error}`,
                  createdAt: Date.now(),
                }
                dispatch({
                  type: 'replace_message',
                  conversationId: activeConvoId,
                  tempId: tempAssistantMsgId,
                  message: errorMsg,
                })
              }
            } catch {
              // Ignore unparseable SSE line
            }
          }
        }
      } catch (err: unknown) {
        const error = err as Error
        console.error('Chat streaming error:', error)
        const errorMsg: Message = {
          id: tempAssistantMsgId,
          role: 'assistant',
          content: `⚠️ ${error.message || 'An error occurred while generating response.'}`,
          createdAt: Date.now(),
        }
        dispatch({
          type: 'replace_message',
          conversationId: activeConvoId,
          tempId: tempAssistantMsgId,
          message: errorMsg,
        })
      } finally {
        dispatch({ type: 'set_streaming', isStreaming: false })
      }
    },
    [isAuthenticated, state.activeId, state.projectId, state.modelId, projectsList]
  )

  const appendVoiceTurn = useCallback(
    (userMessage: Message, assistantMessage: Message) => {
      const activeConvoId = state.activeId
      if (!activeConvoId) return

      dispatch({
        type: 'append_message',
        conversationId: activeConvoId,
        message: userMessage,
      })

      dispatch({
        type: 'append_message',
        conversationId: activeConvoId,
        message: assistantMessage,
      })
    },
    [state.activeId]
  )

  const project = useMemo(
    () =>
      projectsList.find((p) => p.id === state.projectId) ||
      projectsList[0] || {
        id: 'default',
        name: 'Workspace',
        stack: 'Next.js',
      },
    [projectsList, state.projectId]
  )

  const active = useMemo(
    () => state.conversations.find((c) => c.id === state.activeId) ?? null,
    [state.conversations, state.activeId]
  )

  const recents = useMemo(
    () =>
      state.conversations
        .filter((c) => !c.archived)
        .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt),
    [state.conversations]
  )

  const getConversation = useCallback(
    (id: string) => state.conversations.find((c) => c.id === id),
    [state.conversations]
  )

  const setMode = useCallback((mode: InputMode) => dispatch({ type: 'mode', mode }), [])
  const selectProject = useCallback((id: string) => dispatch({ type: 'project', id }), [])
  const setSurface = useCallback((surface: Surface | null) => dispatch({ type: 'surface', surface }), [])

  return useMemo(
    () => ({
      project,
      projects: projectsList,
      recents,
      conversations: recents.filter((c) => c.projectId === state.projectId),
      active,
      mode: state.mode,
      surface: state.surface,
      modelId: state.modelId,
      isStreaming: state.isStreaming,
      getConversation,
      selectConversation,
      newConversation,
      send,
      appendVoiceTurn,
      setModel,
      setMode,
      selectProject,
      setSurface,
      renameConversation,
      togglePin,
      moveConversation,
      setArchived,
      deleteConversation,
      restoreConversation,
      createProject,
      renameProject,
      deleteProject,
    }),
    [
      project,
      projectsList,
      recents,
      state.projectId,
      active,
      state.mode,
      state.surface,
      state.modelId,
      state.isStreaming,
      getConversation,
      selectConversation,
      newConversation,
      send,
      appendVoiceTurn,
      setModel,
      setMode,
      selectProject,
      setSurface,
      renameConversation,
      togglePin,
      moveConversation,
      setArchived,
      deleteConversation,
      restoreConversation,
      createProject,
      renameProject,
      deleteProject,
    ]
  )
}

export type Workspace = ReturnType<typeof useWorkspace>
