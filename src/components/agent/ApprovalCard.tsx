import { useState } from 'react'
import type { ChangeApproval } from '../../types/chat'
import { useToast } from '../ui/Toast'
import { Icon } from '../ui/Icon'
import { AgentCard } from './AgentCard'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * Approval for major / risky changes only — normal actions never come here.
 * UI only: Approve/Cancel just settle the card.
 */
export function ApprovalCard({ approval }: { approval: ChangeApproval }) {
  const [status, setStatus] = useState<'pending' | 'approved' | 'cancelled'>('pending')
  const toast = useToast()

  if (status !== 'pending') {
    return (
      <div className="agent-card">
        <p className="approval__done" data-status={status} role="status">
          <span aria-hidden="true">{status === 'approved' ? '✓' : '×'}</span>
          {status === 'approved' ? 'Changes approved' : 'Changes cancelled'}
        </p>
      </div>
    )
  }

  const lines = [
    `${plural(approval.files, 'file', 'files')} modified`,
    plural(approval.migrations, 'migration', 'migrations'),
    `${plural(approval.dependencies, 'dependency', 'dependencies')} added`,
  ]

  return (
    <AgentCard
      title="Wants to make these changes:"
      tone="warn"
      badge={
        <span className="agent-badge agent-badge--warn">
          <Icon name="alert" size={13} />
          Major change
        </span>
      }
    >
      <ul className="approval__lines">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <p className="approval__note">Approval is only requested for major changes.</p>
      <div className="agent-actions">
        <button
          type="button"
          className="agent-btn"
          onClick={() => toast({ message: 'Change review opens here in a later step' })}
        >
          Review Changes
        </button>
        <button type="button" className="agent-btn agent-btn--primary" onClick={() => setStatus('approved')}>
          Approve
        </button>
        <button type="button" className="agent-btn agent-btn--quiet" onClick={() => setStatus('cancelled')}>
          Cancel
        </button>
      </div>
    </AgentCard>
  )
}
