import { useEffect, useState } from 'react'
import type { AgentActivity } from '../../types/chat'
import { useToast } from '../ui/Toast'
import { Icon } from '../ui/Icon'

interface AgentActivityCardProps {
  activity: AgentActivity
  /** Walk the steps live (demo pacing) starting from the first one. */
  live?: boolean
  onOpenPreview?: () => void
}

/**
 * Compact expandable coding-agent activity in the conversation stream.
 * UI only — the steps are placeholder content, not a real agent run.
 */
export function AgentActivityCard({ activity, live = false, onOpenPreview }: AgentActivityCardProps) {
  const total = activity.steps.length
  /** Index of the in-progress step; `total` means everything is done. */
  const [current, setCurrent] = useState(live ? 0 : total)
  const [expanded, setExpanded] = useState(true)
  const toast = useToast()
  const done = current >= total
  const issues = activity.outcome === 'issues'

  // Demo pacing for live runs; replaced by real agent events in a later step.
  useEffect(() => {
    if (!live || done) return
    const id = window.setInterval(() => setCurrent((c) => Math.min(c + 1, total)), 850)
    return () => window.clearInterval(id)
  }, [live, done, total])

  const title = done ? (issues ? 'Build completed with issues' : 'Build completed') : 'Building your project...'
  const sub = done ? activity.summary.map((l) => l.label).join(' · ') : `● ${activity.steps[Math.min(current, total - 1)]}`

  const nextSteps = issues ? (
    <>
      <button
        type="button"
        className="agent-btn agent-btn--primary"
        onClick={() => toast({ message: 'Automatic fixes come in a later step' })}
      >
        Fix Automatically
      </button>
      <button
        type="button"
        className="agent-btn"
        onClick={() => toast({ message: 'Error review opens here in a later step' })}
      >
        Review Errors
      </button>
    </>
  ) : (
    <>
      <button
        type="button"
        className="agent-btn agent-btn--primary"
        onClick={() => (onOpenPreview ? onOpenPreview() : toast({ message: 'Preview opens here in a later step' }))}
      >
        Open Preview
      </button>
      <button
        type="button"
        className="agent-btn"
        onClick={() => toast({ message: 'Change review opens here in a later step' })}
      >
        Review Changes
      </button>
    </>
  )

  return (
    <div className="agent-card" data-tone={done && issues ? 'warn' : 'default'}>
      <div className="agent-card__head">
        <span className="agent-card__mark" aria-hidden="true">
          <Icon name="code" size={13} strokeWidth={2} />
        </span>
        <span className="agent-card__who">VX</span>
        {done && issues && (
          <span className="agent-card__badge">
            <span className="agent-badge agent-badge--warn">
              <Icon name="alert" size={13} />
              Issues
            </span>
          </span>
        )}
      </div>

      <button type="button" className="activity__toggle" aria-expanded={expanded} onClick={() => setExpanded((e) => !e)}>
        <span className="activity__text">
          <span className="activity__title">{title}</span>
          <span className="activity__sub">{sub}</span>
        </span>
        <span className="activity__chevron" data-open={expanded || undefined} aria-hidden="true">
          <Icon name="chevronDown" size={18} />
        </span>
      </button>

      {expanded && (
        <div>
          <ul className="activity__steps">
            {activity.steps.map((s, i) => {
              const status = done || i < current ? 'done' : i === current ? 'current' : 'pending'
              return (
                <li key={s} data-status={status}>
                  <span className="activity__glyph" aria-hidden="true">
                    {status === 'done' ? '✓' : status === 'current' ? '●' : '○'}
                  </span>
                  {s}
                  <span className="sr-only">
                    {status === 'done' ? ' (completed)' : status === 'current' ? ' (in progress)' : ' (pending)'}
                  </span>
                </li>
              )
            })}
          </ul>

          {done && (
            <>
              <ul className="activity__summary">
                {activity.summary.map((l) => (
                  <li key={l.label} data-status={l.status}>
                    <span className="activity__glyph" aria-hidden="true">
                      {l.status === 'warn' ? '⚠' : '✓'}
                    </span>
                    {l.label}
                  </li>
                ))}
              </ul>
              <p className="activity__next">Next steps</p>
              <div className="agent-actions">{nextSteps}</div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
