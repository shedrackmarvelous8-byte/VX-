import { forwardRef, type ReactNode } from 'react'
import type { Message as MessageType } from '../../types/chat'
import { Message } from './Message'
import './MessageList.css'

interface MessageListProps {
  messages: MessageType[]
  isStreaming?: boolean
  onScroll?: () => void
  /** Rendered when there are no messages */
  empty?: ReactNode
  /** Wired to contextual cards ("Open Preview") */
  onOpenPreview?: () => void
}

/** Scroll container for the conversation. Centered reading column on wide screens. */
export const MessageList = forwardRef<HTMLDivElement, MessageListProps>(function MessageList(
  { messages, isStreaming, onScroll, empty, onOpenPreview },
  ref,
) {
  return (
    <div ref={ref} className="thread" onScroll={onScroll}>
      <div className="thread__column" role="log" aria-live="polite" aria-label="Conversation">
        {messages.length === 0 ? (
          empty
        ) : (
          messages.map((m, idx) => (
            <Message
              key={m.id}
              message={m}
              isLast={idx === messages.length - 1}
              isStreaming={isStreaming && idx === messages.length - 1}
              onOpenPreview={onOpenPreview}
            />
          ))
        )}
      </div>
    </div>
  )
})
