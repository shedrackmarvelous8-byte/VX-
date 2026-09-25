import type { ReactNode } from 'react'
import './AppShell.css'

/**
 * Root layout: [sidebar] [main column]. The main column is a flex stack of
 * header → thread → composer, sized to the visual viewport so the composer
 * never hides behind the on-screen keyboard.
 *
 * Future contextual panels (Plan / Code / Preview) should mount into `aside`
 * as sheets on mobile and a side panel on desktop — never permanently.
 */
export function AppShell({ sidebar, children, aside }: { sidebar: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="shell">
      {sidebar}
      <main className="shell__main">{children}</main>
      {aside}
    </div>
  )
}
