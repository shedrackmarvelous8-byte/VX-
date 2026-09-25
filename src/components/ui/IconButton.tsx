import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Icon, type IconName } from './Icon'
import './IconButton.css'

type Variant = 'ghost' | 'surface' | 'primary'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName
  label: string
  variant?: Variant
  size?: 'md' | 'sm'
  active?: boolean
  iconSize?: number
}

/** 44px minimum touch target. `sm` keeps the 44px hit area but a smaller visual. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant = 'ghost', size = 'md', active, iconSize, className = '', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      data-active={active || undefined}
      className={`icon-btn icon-btn--${variant} icon-btn--${size} ${className}`}
      {...rest}
    >
      <span className="icon-btn__visual">
        <Icon name={icon} size={iconSize ?? (size === 'sm' ? 18 : 20)} />
      </span>
    </button>
  )
})
