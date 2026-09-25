import type { ReactNode } from 'react'
import { Icon } from '../ui/Icon'
import './agent.css'

interface AgentCardProps {
  /** Card heading, e.g. "Build Plan" */
  title: string
  /** Optional slot on the identity row (badges etc.) */
  badge?: ReactNode
  /** `warn` marks major / risky content */
  tone?: 'default' | 'warn'
  children: ReactNode
}

/**
 * Shared chrome for VX's contextual cards in the conversation:
 * VX identity row + heading + content. These are messages, not a dashboard.
 */
export function AgentCard({ title, badge, tone = 'default', children }: AgentCardProps) {
  return (
    <div className="agent-card" data-tone={tone}>
      <div className="agent-card__head">
        <span className="agent-card__mark" aria-hidden="true">
          <Icon name="code" size={13} strokeWidth={2} />
        </span>
        <span className="agent-card__who">VX</span>
        {badge && <span className="agent-card__badge">{badge}</span>}
      </div>
      <h3 className="agent-card__title">{title}</h3>
      {children}
    </div>
  )
}
