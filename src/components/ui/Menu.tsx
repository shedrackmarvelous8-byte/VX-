import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { Icon, type IconName } from './Icon'
import './Menu.css'

/**
 * Anchored contextual menu (popover). Portaled to <body>, positioned against its trigger,
 * flips above when there isn't room below and is clamped to the viewport.
 * Keyboard: ↑/↓/Home/End to move, Esc to close (focus returns to the trigger).
 */
interface MenuProps {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  onClose: () => void
  children: ReactNode
  label: string
  align?: 'start' | 'end'
  width?: number
}

const GAP = 6
const EDGE = 8

export function Menu({ open, anchorRef, onClose, children, label, align = 'end', width = 232 }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; origin: string } | null>(null)

  const place = useCallback(() => {
    const anchor = anchorRef.current
    const menu = ref.current
    if (!anchor || !menu) return
    const a = anchor.getBoundingClientRect()
    const h = menu.offsetHeight
    const vw = window.innerWidth
    const vh = window.visualViewport?.height ?? window.innerHeight
    const below = vh - a.bottom - GAP - EDGE
    const flip = below < h && a.top - GAP - EDGE > below
    let top = flip ? a.top - GAP - h : a.bottom + GAP
    top = Math.max(EDGE, Math.min(top, vh - h - EDGE))
    let left = align === 'end' ? a.right - width : a.left
    left = Math.max(EDGE, Math.min(left, vw - width - EDGE))
    setPos({ top, left, origin: `${align === 'end' ? 'right' : 'left'} ${flip ? 'bottom' : 'top'}` })
  }, [anchorRef, align, width])

  // Position before paint, and re-place when content (e.g. a sub-view) changes size.
  useLayoutEffect(() => {
    if (!open) return
    place()
    const ro = new ResizeObserver(place)
    if (ref.current) ro.observe(ref.current)
    return () => ro.disconnect()
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const items = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? [])
    requestAnimationFrame(() => items()[0]?.focus({ preventScroll: true }))

    const close = (restoreFocus: boolean) => {
      onClose()
      if (restoreFocus) anchorRef.current?.focus({ preventScroll: true })
    }
    const onKey = (e: KeyboardEvent) => {
      const list = items()
      const i = list.indexOf(document.activeElement as HTMLElement)
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true) }
      else if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length]?.focus() }
      else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus() }
      else if (e.key === 'Home') { e.preventDefault(); list[0]?.focus() }
      else if (e.key === 'End') { e.preventDefault(); list[list.length - 1]?.focus() }
      else if (e.key === 'Tab') close(false)
    }
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t) || anchorRef.current?.contains(t)) return
      close(false)
    }
    const onResize = () => close(false)
    // Capture phase so Esc doesn't also close the drawer underneath.
    window.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onPointer, true)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onPointer, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open, onClose, anchorRef])

  if (!open) return null
  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      className="menu"
      data-ready={pos ? true : undefined}
      style={{ width, top: pos?.top ?? -9999, left: pos?.left ?? -9999, transformOrigin: pos?.origin }}
    >
      {children}
    </div>,
    document.body,
  )
}

interface MenuItemProps {
  icon?: IconName
  label: string
  onSelect: () => void
  danger?: boolean
  checked?: boolean
  trailing?: ReactNode
  hint?: string
}

export function MenuItem({ icon, label, onSelect, danger, checked, trailing, hint }: MenuItemProps) {
  return (
    <button
      type="button"
      role={checked === undefined ? 'menuitem' : 'menuitemradio'}
      aria-checked={checked}
      className="menu__item"
      data-danger={danger || undefined}
      onClick={onSelect}
    >
      {icon && <Icon name={icon} size={18} className="menu__icon" />}
      <span className="menu__text">
        <span className="menu__label">{label}</span>
        {hint && <span className="menu__hint">{hint}</span>}
      </span>
      {checked && <Icon name="check" size={16} className="menu__check" />}
      {trailing && <span className="menu__trailing">{trailing}</span>}
    </button>
  )
}

export function MenuSeparator() {
  return <div className="menu__sep" role="separator" />
}

/** Header for sub-views inside a menu (e.g. "Move to"), with a back affordance. */
export function MenuHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="menu__header">
      <button type="button" role="menuitem" className="menu__back" onClick={onBack} aria-label="Back">
        <Icon name="chevronLeft" size={18} />
      </button>
      <span className="menu__title">{title}</span>
    </div>
  )
}
