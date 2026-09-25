import type { ReactNode } from 'react'

interface SidebarSectionProps {
  title: string
  action?: ReactNode
  children: ReactNode
}

/** Quiet section label + content. No borders, spacing does the separating. */
export function SidebarSection({ title, action, children }: SidebarSectionProps) {
  const id = `sb-${title.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <section className="sb-section" aria-labelledby={id}>
      <div className="sb-section__head">
        <h3 id={id} className="sb-section__title">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}
