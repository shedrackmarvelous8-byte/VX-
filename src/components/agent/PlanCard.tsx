import type { BuildPlan } from '../../types/chat'
import { Icon } from '../ui/Icon'
import { AgentCard } from './AgentCard'

interface PlanCardProps {
  plan: BuildPlan
  onGenerate: () => void
  onCustomize: () => void
  onSkip: () => void
}

/** Temporary contextual Build Plan — disappears once Generate or Skip is chosen. */
export function PlanCard({ plan, onGenerate, onCustomize, onSkip }: PlanCardProps) {
  return (
    <AgentCard title="Build Plan">
      <div className="plan__rows">
        <div className="plan__row">
          <span className="plan__label">Project type</span>
          <span className="plan__value">{plan.projectType}</span>
        </div>
        <div className="plan__row">
          <span className="plan__label">Structure</span>
          <span className="plan__value">
            <ul className="plan__list">
              {plan.structure.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </span>
        </div>
        <div className="plan__row">
          <span className="plan__label">Visual direction</span>
          <span className="plan__value">
            <span className="plan__chips">
              {plan.visualDirection.map((v) => (
                <span key={v} className="plan__chip">
                  {v}
                </span>
              ))}
            </span>
          </span>
        </div>
        <div className="plan__row">
          <span className="plan__label">Features</span>
          <span className="plan__value">
            <ul className="plan__list">
              {plan.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </span>
        </div>
        <div className="plan__row">
          <span className="plan__label">Technical approach</span>
          <span className="plan__value">{plan.technical}</span>
        </div>
        {plan.extra && (
          <div className="plan__row">
            <span className="plan__label">Extra instructions</span>
            <span className="plan__value plan__extra">{plan.extra}</span>
          </div>
        )}
      </div>
      <div className="agent-actions">
        <button type="button" className="agent-btn agent-btn--primary" onClick={onGenerate}>
          Generate
        </button>
        <button type="button" className="agent-btn" onClick={onCustomize}>
          <Icon name="settings" size={16} />
          Customize
        </button>
        <button type="button" className="agent-btn agent-btn--quiet" onClick={onSkip}>
          Skip
        </button>
      </div>
    </AgentCard>
  )
}
