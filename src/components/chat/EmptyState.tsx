import { starterPrompts } from '../../data/placeholder'
import { Icon } from '../ui/Icon'
import './EmptyState.css'

interface EmptyStateProps {
  projectName: string
  onPick: (text: string) => void
}

export function EmptyState({ projectName, onPick }: EmptyStateProps) {
  return (
    <div className="empty">
      <div className="empty__intro">
        <span className="empty__mark" aria-hidden="true">
          <Icon name="code" size={22} strokeWidth={2} />
        </span>
        <h1 className="empty__title">What are we building?</h1>
        <p className="empty__subtitle">
          Describe a feature, paste an error, or ask about <span className="empty__project">{projectName}</span>.
        </p>
      </div>

      <ul className="empty__prompts">
        {starterPrompts.map((p, i) => (
          <li key={p.title} style={{ animationDelay: `${60 + i * 40}ms` }}>
            <button type="button" className="empty__prompt" onClick={() => onPick(p.body)}>
              <Icon name={p.icon} size={18} className="empty__prompt-icon" />
              <span className="empty__prompt-text">
                <span className="empty__prompt-title">{p.title}</span>
                <span className="empty__prompt-body">{p.body}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
