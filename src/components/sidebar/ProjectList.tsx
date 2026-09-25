import type { Project } from '../../types/chat'
import { relativeTime } from './navigation'

interface ProjectListProps {
  projects: Project[]
  activeId: string
  onSelect: (id: string) => void
}

export function ProjectList({ projects, activeId, onSelect }: ProjectListProps) {
  return (
    <ul className="project-list">
      {projects.map((p) => (
        <li key={p.id}>
          <button
            type="button"
            className="project-item"
            aria-current={p.id === activeId ? 'true' : undefined}
            onClick={() => onSelect(p.id)}
          >
            <span className="project-item__avatar" aria-hidden="true">{p.name.charAt(0)}</span>
            <span className="project-item__text">
              <span className="project-item__name">{p.name}</span>
              <span className="project-item__meta">
                {[p.stack, relativeTime(p.updatedAt)].filter(Boolean).join(' · ')}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
