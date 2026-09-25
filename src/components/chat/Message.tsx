import { memo, useState } from 'react'
import type { Message as MessageType } from '../../types/chat'
import { AgentActivityCard } from '../agent/AgentActivityCard'
import { AgentFlow } from '../agent/AgentFlow'
import { ApprovalCard } from '../agent/ApprovalCard'
import { Markdown } from '../markdown/Markdown'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import './Message.css'

function UserMessage({ message }: { message: MessageType }) {
  return (
    <div className="msg msg--user">
      {message.attachments && (
        <div className="msg__attachments">
          {message.attachments.map((a) => (
            <span key={a.id} className="msg__file">
              <Icon name="file" size={15} />
              <span>{a.name}</span>
            </span>
          ))}
        </div>
      )}
      {message.content && <div className="msg__bubble">{message.content}</div>}
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="typing-indicator" role="status" aria-label="AI is thinking">
      <span className="typing-dot" />
      <span className="typing-dot" />
      <span className="typing-dot" />
    </div>
  )
}

function AssistantMessage({ message, isStreaming }: { message: MessageType; isStreaming?: boolean }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
    } catch {
      /* noop */
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  const isEmpty = !message.content || message.content.trim() === ''

  return (
    <div className="msg msg--assistant">
      {isEmpty ? (
        <TypingIndicator />
      ) : (
        <div className="msg__content-wrapper">
          <Markdown content={message.content} />
          {isStreaming && <span className="typing-cursor" aria-hidden="true" />}
        </div>
      )}
      {!isEmpty && (
        <div className="msg__actions">
          <IconButton icon={copied ? 'check' : 'copy'} label={copied ? 'Copied' : 'Copy response'} size="sm" onClick={copy} />
          <IconButton icon="more" label="More actions" size="sm" />
        </div>
      )}
    </div>
  )
}

export const Message = memo(function Message({
  message,
  isStreaming,
  onOpenPreview,
}: {
  message: MessageType
  isLast?: boolean
  isStreaming?: boolean
  onOpenPreview?: () => void
}) {
  // Contextual VX cards (Build Plan, agent activity, approval)
  if (message.kind === 'plan' && message.plan && message.activity) {
    return (
      <div className="msg msg--assistant">
        <AgentFlow plan={message.plan} activity={message.activity} onOpenPreview={onOpenPreview} />
      </div>
    )
  }
  if (message.kind === 'activity' && message.activity) {
    return (
      <div className="msg msg--assistant">
        <AgentActivityCard activity={message.activity} onOpenPreview={onOpenPreview} />
      </div>
    )
  }
  if (message.kind === 'approval' && message.approval) {
    return (
      <div className="msg msg--assistant">
        <ApprovalCard approval={message.approval} />
      </div>
    )
  }
  return message.role === 'user' ? (
    <UserMessage message={message} />
  ) : (
    <AssistantMessage message={message} isStreaming={isStreaming} />
  )
})
