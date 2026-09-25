import type { IconName } from '../ui/Icon'
import type { Surface } from '../../types/chat'

/** Development surfaces listed in the sidebar. Order = display order. */
export const devNav: { id: Surface; label: string; icon: IconName }[] = [
  { id: 'preview', label: 'Preview', icon: 'preview' },
  { id: 'code', label: 'Code', icon: 'code' },
  { id: 'terminal', label: 'Terminal', icon: 'terminal' },
  { id: 'database', label: 'Database', icon: 'database' },
  { id: 'environment', label: 'Environment', icon: 'environment' },
  { id: 'github', label: 'GitHub', icon: 'github' },
]

export const surfaceLabel = (s: Surface) =>
  s === 'files' ? 'Files' : devNav.find((n) => n.id === s)?.label ?? s

export function relativeTime(ts?: number) {
  if (!ts) return ''
  const m = Math.round((Date.now() - ts) / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d ago`
  return `${Math.round(d / 7)}w ago`
}
