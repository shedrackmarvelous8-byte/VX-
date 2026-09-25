import type { ReactNode } from 'react'
import { Icon, type IconName } from '../ui/Icon'

interface NavItemProps {
  icon: IconName
  label: string
  active?: boolean
  trailing?: ReactNode
  onClick?: () => void
}

/** Single sidebar row: line icon + label (+ optional trailing meta). 44px touch target. */
export function NavItem({ icon, label, active, trailing, onClick }: NavItemProps) {
  return (
    <button
      type="button"
      className="nav-item"
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
    >
      <Icon name={icon} size={19} className="nav-item__icon" />
      <span className="nav-item__label">{label}</span>
      {trailing != null && <span className="nav-item__trailing">{trailing}</span>}
    </button>
  )
}
